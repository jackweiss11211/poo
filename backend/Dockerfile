# Use official Node.js image
FROM node:18-slim

# Install latest chrome dev package and dependencies
RUN apt-get update \
    && apt-get install -y wget gnupg \
    && wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | apt-key add - \
    && sh -c 'echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google.list' \
    && apt-get update \
    && apt-get install -y google-chrome-stable fonts-ipafont-gothic fonts-wqy-zenhei fonts-thai-tlwg fonts-kacst fonts-freefont-ttf \
      --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Add user so we don't need --no-sandbox
RUN groupadd -r pptruser && useradd -r -g pptruser -G audio,video pptruser \
    && mkdir -p /home/pptruser/Downloads \
    && chown -R pptruser:pptruser /home/pptruser

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install puppeteer \
    && npm install

# Copy the rest of the application
COPY . .

# Expose port
EXPOSE 10000

# Create downloads directory
RUN mkdir -p downloads

# Set environment variables
ENV NODE_ENV=production
ENV PORT=10000
ENV CHROME_EXECUTABLE_PATH=/usr/bin/google-chrome

# Switch to non-root user
USER pptruser

# Start the server
CMD ["npm", "start"]
