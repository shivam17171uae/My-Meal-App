const express = require('express');
const path = require('path');
const multer = require('multer');
const { open } = require('sqlite');
const sqlite3 = require('sqlite3');
const fs = require('fs');
const app = express();
const PORT = 3000;
const DB_PATH = path.join(__dirname, 'data', 'database.sqlite');
const UPLOADS_PATH = path.join(__dirname, 'public');
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
let db;
(async () => {
    db = await open({ filename: DB_PATH, driver: sqlite3.Database });
    console.log('Connected to the SQLite database.');
    await db.exec('PRAGMA foreign_keys = ON;');
    await db.exec(`
        CREATE TABLE IF NOT EXISTS ingredients (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, category TEXT, calories REAL, protein REAL, carbs REAL, fat REAL, fiber REAL, price REAL, per_unit INTEGER DEFAULT 100, image_url TEXT);
        CREATE TABLE IF NOT EXISTS recipes (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, instructions TEXT, image_url TEXT);
        CREATE TABLE IF NOT EXISTS recipe_ingredients (recipe_id INTEGER, ingredient_id INTEGER, quantity_grams REAL NOT NULL, FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE, FOREIGN KEY (ingredient_id) REFERENCES ingredients(id) ON DELETE CASCADE, PRIMARY KEY (recipe_id, ingredient_id));
        CREATE TABLE IF NOT EXISTS meal_planner (id INTEGER PRIMARY KEY AUTOINCREMENT, date TEXT NOT NULL, meal_type TEXT NOT NULL, recipe_id INTEGER, ingredient_id INTEGER, quantity_grams REAL, FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE, FOREIGN KEY (ingredient_id) REFERENCES ingredients(id) ON DELETE CASCADE);
    `);
})();
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dest = req.path.includes('recipe') ? './public/uploads/recipes/' : './public/uploads/ingredients/';
        cb(null, dest);
    },
    filename: (req, file, cb) => {
        const prefix = req.path.includes('recipe') ? 'recipe-' : 'ingredient-';
        cb(null, prefix + Date.now() + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage }).single('image');
const deleteImage = async (id, table) => {
    try {
        const item = await db.get(`SELECT image_url FROM ${table} WHERE id = ?`, [id]);
        if (item && item.image_url && !item.image_url.includes('default-recipe.png')) {
            const imagePath = path.join(UPLOADS_PATH, item.image_url);
            if (fs.existsSync(imagePath)) fs.unlinkSync(imagePath);
        }
    } catch (e) { console.error("Error deleting image:", e); }
};
app.get('/api/ingredients', async (req, res) => res.json(await db.all('SELECT * FROM ingredients ORDER BY name')));
app.post('/api/ingredients', upload, async (req, res) => { const { name, category, calories, protein, carbs, fat, price } = req.body; const imageUrl = req.file ? `/uploads/ingredients/${req.file.filename}` : null; try { const result = await db.run('INSERT INTO ingredients (name, category, calories, protein, carbs, fat, price, image_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [name, category, calories, protein, carbs, fat, price, imageUrl]); res.status(201).json({ id: result.lastID, ...req.body, image_url: imageUrl }); } catch (dbErr) { res.status(400).json({ error: 'Ingredient with this name already exists.' }); } });
app.put('/api/ingredients/:id', upload, async (req, res) => { const { id } = req.params; const { name, category, calories, protein, carbs, fat, price } = req.body; const existing = await db.get('SELECT image_url FROM ingredients WHERE id = ?', [id]); if (req.file && existing.image_url) await deleteImage(id, 'ingredients'); const imageUrl = req.file ? `/uploads/ingredients/${req.file.filename}` : existing.image_url; try { await db.run('UPDATE ingredients SET name=?, category=?, calories=?, protein=?, carbs=?, fat=?, price=?, image_url=? WHERE id=?', [name, category, calories, protein, carbs, fat, price, imageUrl, id]); res.status(200).json({ message: 'Ingredient updated' }); } catch (dbErr) { res.status(400).json({ error: 'Update failed. Ingredient name might already exist.' }); } });
app.delete('/api/ingredients/:id', async (req, res) => { await deleteImage(req.params.id, 'ingredients'); await db.run('DELETE FROM ingredients WHERE id = ?', [req.params.id]); res.status(200).json({ message: 'Ingredient deleted' }); });
app.get('/api/recipes', async (req, res) => { const recipes = await db.all(`SELECT r.id, r.name, r.instructions, r.image_url, (SELECT json_group_array(json_object('id', i.id, 'name', i.name, 'quantity', ri.quantity_grams)) FROM recipe_ingredients ri JOIN ingredients i ON ri.ingredient_id = i.id WHERE ri.recipe_id = r.id) as ingredients FROM recipes r ORDER BY r.name`); res.json(recipes.map(r => ({ ...r, ingredients: JSON.parse(r.ingredients) || [] }))); });
app.post('/api/recipes', upload, async (req, res) => { const { name, instructions, ingredients } = JSON.parse(req.body.recipeData); const imageUrl = req.file ? `/uploads/recipes/${req.file.filename}` : '/default-recipe.png'; const recipeResult = await db.run('INSERT INTO recipes (name, instructions, image_url) VALUES (?, ?, ?)', [name, instructions, imageUrl]); const recipeId = recipeResult.lastID; if (ingredients && ingredients.length > 0) { const stmt = await db.prepare('INSERT INTO recipe_ingredients (recipe_id, ingredient_id, quantity_grams) VALUES (?, ?, ?)'); for (const ing of ingredients) await stmt.run(recipeId, ing.id, ing.quantity); await stmt.finalize(); } res.status(201).json({ message: 'Recipe created', recipeId }); });
app.put('/api/recipes/:id', upload, async (req, res) => { const { id } = req.params; const { name, instructions, ingredients } = JSON.parse(req.body.recipeData); const existing = await db.get('SELECT image_url FROM recipes WHERE id = ?', [id]); if (req.file) await deleteImage(id, 'recipes'); const imageUrl = req.file ? `/uploads/recipes/${req.file.filename}` : existing.image_url; await db.run('UPDATE recipes SET name=?, instructions=?, image_url=? WHERE id=?', [name, instructions, imageUrl, id]); await db.run('DELETE FROM recipe_ingredients WHERE recipe_id = ?', [id]); if (ingredients && ingredients.length > 0) { const stmt = await db.prepare('INSERT INTO recipe_ingredients (recipe_id, ingredient_id, quantity_grams) VALUES (?, ?, ?)'); for (const ing of ingredients) await stmt.run(id, ing.id, ing.quantity); await stmt.finalize(); } res.status(200).json({ message: 'Recipe updated' }); });
app.delete('/api/recipes/:id', async (req, res) => { await deleteImage(req.params.id, 'recipes'); await db.run('DELETE FROM recipes WHERE id = ?', [req.params.id]); res.status(200).json({ message: 'Recipe deleted' }); });
app.post('/api/meal-planner', async (req, res) => { const { date, meal_type, item_type, item_id, quantity } = req.body; let result = (item_type === 'recipe') ? await db.run('INSERT INTO meal_planner (date, meal_type, recipe_id) VALUES (?, ?, ?)', [date, meal_type, item_id]) : await db.run('INSERT INTO meal_planner (date, meal_type, ingredient_id, quantity_grams) VALUES (?, ?, ?, ?)', [date, meal_type, item_id, quantity]); res.status(201).json({ id: result.lastID }); });
app.delete('/api/meal-planner/:id', async (req, res) => { await db.run('DELETE FROM meal_planner WHERE id = ?', [req.params.id]); res.status(200).json({ message: 'Item removed' }); });
app.get('/api/meal-planner/:date', async (req, res) => { const planItems = await db.all(`SELECT mp.id, mp.date, mp.meal_type, mp.recipe_id, mp.ingredient_id, mp.quantity_grams, r.name as recipe_name, r.image_url as recipe_image, i.name as ingredient_name, i.image_url as ingredient_image, i.calories, i.protein, i.carbs, i.fat, i.price FROM meal_planner mp LEFT JOIN recipes r ON mp.recipe_id = r.id LEFT JOIN ingredients i ON mp.ingredient_id = i.id WHERE mp.date = ?`, [req.params.date]); res.json(planItems); });
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
