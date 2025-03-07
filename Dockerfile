# Stage 1: Build the application
FROM node:18-alpine AS builder

# Set the working directory
WORKDIR /app

# Copy package.json and yarn.lock
COPY package.json yarn.lock ./

# Install dependencies
RUN yarn install

# Copy the rest of the application code
COPY . .

# Build the application
RUN yarn build

# Stage 2: Serve the application
FROM node:18-alpine AS server

# Install 'serve' globally
RUN yarn global add serve

# Copy the built files from the builder stage
COPY --from=builder /app/dist /app/dist

# Set the working directory
WORKDIR /app/dist

# Expose port 3000
EXPOSE 3000

# Serve the application
CMD ["serve", "-s", ".", "-l", "3000"]