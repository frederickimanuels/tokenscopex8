# Dockerfile

# Stage 1: Build the application
FROM node:22-alpine AS builder

# Set the working directory
WORKDIR /usr/src/app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of the application code
COPY . .

# Stage 2: Create the production image
FROM node:22-alpine

WORKDIR /usr/src/app

# Copy dependencies from the builder stage
COPY --from=builder /usr/src/app/node_modules ./node_modules

# Copy application code from the builder stage
COPY --from=builder /usr/src/app ./

# Command to run the application
# This is overridden by docker-compose.yml
CMD [ "node", "index.js" ]