# My Meal App - v4.5.0 (Stable)

This repository contains the complete source code and data for My Meal App, a self-hosted meal planning application. This `v4.5.0` commit represents a stable, feature-complete version with a refined user interface and a robust set of functionalities.

## Key Features

- **Full CRUD Functionality:** Create, Read, Edit, and Delete both Recipes and Ingredients.
- **Data Persistence:** User data, including recipes, ingredients, and uploaded images, is stored in persistent Docker volumes.
- **Modern, Responsive UI:**
    - A sleek, floating navigation bar with a central "+" button for intuitive actions.
    - Beautiful "glassmorphism" card design for recipes and ingredients.
    - Redesigned, elegant modal forms for adding and editing items.
    - A visually rich Meal Planner with a dashboard-style totals display and an interactive date scroller.
- **Dynamic Theming:** Recipe and ingredient cards dynamically pick up colors from their images for a beautiful, cohesive look.
- **Data Visualization:** Nutritional information on cards is color-coded and paired with custom icons for instant readability.
- **Self-Hosted:** Runs entirely within Docker, giving you full control over your data.
- **Automated Deployment:** The entire application, including data migration between versions, is handled by a single, comprehensive bash script.

---

## Master Deployment Script (v4.5.0)

This is the final, stable script used to deploy version `v4.5.0` of the application. It handles everything from cleaning the Docker environment to migrating data and creating all necessary application files.

<details>
<summary>Click to view the full deployment script</summary>

```bash
# --- 1. DEFINE PROJECT DIRECTORY, NEW PORT, AND VERSION ---
PROJECT_VERSION="v4.5.0"
OLD_PROJECT_DIR="/srv/docker/my-meal-app-v4.4.0" # Migrate from the previous version
PROJECT_DIR="/srv/docker/my-meal-app-${PROJECT_VERSION}" # Create a new versioned directory
HOST_PORT="5029" # Using new port 5029
echo "--- Upgrading My Meal App to ${PROJECT_VERSION} on NEW PORT ${HOST_PORT} ---"
echo "--- This version fixes modal UI and redesigns card buttons for a cleaner look. ---"

# --- 2. CLEAN UP UNUSED DOCKER NETWORKS ---
echo "--- Cleaning up old Docker networks... ---"
docker network prune -f

# --- 3. STOP AND REMOVE PREVIOUS CONTAINER ---
echo "--- Stopping and removing the v4.4.0 container... ---"
docker stop "my-meal-app-v4.4.0" > /dev/null 2>&1
docker rm "my-meal-app-v4.4.0" > /dev/null 2>&1
echo "--- Old container removed. ---"

# --- 4. ENSURE NEW PROJECT DIRECTORY EXISTS ---
echo "--- Preparing new project directory at $PROJECT_DIR... ---"
mkdir -p "$PROJECT_DIR/app/public/uploads/ingredients" "$PROJECT_DIR/app/public/uploads/recipes" "$PROJECT_DIR/app/data"

# --- 5. MIGRATE DATA FROM PREVIOUS VERSION ---
echo "--- Migrating data from ${OLD_PROJECT_DIR}... ---"
if [ -d "$OLD_PROJECT_DIR/app/data" ]; then
    cp -r "$OLD_PROJECT_DIR/app/data/." "$PROJECT_DIR/app/data/" && echo "--- Database copied. ---"
else
    echo "--- No previous database found. ---"
fi
if [ -d "$OLD_PROJECT_DIR/app/public/uploads" ]; then
    cp -r "$OLD_PROJECT_DIR/app/public/uploads/." "$PROJECT_DIR/app/public/uploads/" && echo "--- Images copied. ---"
else
    echo "--- No previous images found. ---"
fi

# --- 6. CREATE/OVERWRITE THE DOCKER COMPOSE FILE ---
cat <<EOF > "$PROJECT_DIR/docker-compose.yml"
version: '3.8'
services:
  meal-app:
    build: ./app
    container_name: my-meal-app-${PROJECT_VERSION}
    ports:
      - "${HOST_PORT}:3000"
    volumes:
      - ./app/data:/app/data
      - ./app/public/uploads:/app/public/uploads
    restart: unless-stopped
