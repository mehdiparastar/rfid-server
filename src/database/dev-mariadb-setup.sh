#!/bin/bash
set -e

# Load environment variables from .env.development
set -o allexport
source .env.development
set +o allexport

echo "=== Configuring MariaDB for $NODE_ENV ==="

# Detect MariaDB version
MARIADB_VERSION=$(mysql -V | awk '{print $5}' | cut -d- -f1 | cut -d. -f1,2)

# Choose proper root password command
if [[ "$MARIADB_VERSION" < "10.4" ]]; then
    ROOT_CMD="SET PASSWORD FOR 'root'@'localhost' = PASSWORD('${MYSQL_ROOT_PASSWORD}');"
else
    ROOT_CMD="ALTER USER 'root'@'localhost' IDENTIFIED BY '${MYSQL_ROOT_PASSWORD}';"
fi

# Run SQL commands
sudo mysql -u root <<EOF
$ROOT_CMD

-- Create database if not exists
CREATE DATABASE IF NOT EXISTS \`${MYSQL_DATABASE}\`;

-- Create user with password
CREATE USER IF NOT EXISTS '${MYSQL_USER}'@'localhost' IDENTIFIED BY '${MYSQL_PASSWORD}';

-- Grant privileges
GRANT ALL PRIVILEGES ON \`${MYSQL_DATABASE}\`.* TO '${MYSQL_USER}'@'localhost';

-- Apply changes
FLUSH PRIVILEGES;
EOF

echo "✅ MariaDB setup complete for DB: ${MYSQL_DATABASE}, user: ${MYSQL_USER}"
