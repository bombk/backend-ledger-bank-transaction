# Backend Dockerfile
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy package.json and install dependencies
COPY package.json ./
RUN npm install

# Copy source code
COPY . .

# Expose port (assuming default 3000)
EXPOSE 3000

# Start command
CMD ["npm", "start"]
