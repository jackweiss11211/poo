const express = require('express');
const pornhub = require('@justalk/pornhub-api');
const archiver = require('archiver');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

const app = express();
const PORT = process.env.PORT || 10000;

// Configuration
const CONFIG = {
  MAX_VIDEOS: 10,           // Limit total videos per search
  MAX_VIDEO_SIZE: 500 * 1024 * 1024, // 500MB per video
  DOWNLOAD_TIMEOUT: 60000,  // 60 seconds
  DOWNLOADS_DIR: path.join(__dirname, 'downloads'),
  BROWSER_ARGS: [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-accelerated-2d-canvas',
    '--no-first-run',
    '--no-zygote',
    '--single-process',
    '--disable-gpu'
  ]
};

// Ensure downloads directory exists
if (!fs.existsSync(CONFIG.DOWNLOADS_DIR)) {
  fs.mkdirSync(CONFIG.DOWNLOADS_DIR);
}

app.use(express.json());

// Middleware for input validation
const validateSearchQuery = (req, res, next) => {
  const { query } = req.body;

  if (!query || typeof query !== 'string') {
    return res.status(400).json({ 
      error: 'Invalid search query. Must be a non-empty string.' 
    });
  }

  if (query.length < 2 || query.length > 100) {
    return res.status(400).json({ 
      error: 'Search query must be between 2 and 100 characters.' 
    });
  }

  next();
};

// Function to extract video download link
async function extractVideoDownloadLink(page, videoUrl) {
  try {
    // Navigate to the video page
    await page.goto(videoUrl, { 
      waitUntil: 'networkidle0',
      timeout: CONFIG.DOWNLOAD_TIMEOUT 
    });

    // Wait for potential download buttons or video sources
    await page.waitForTimeout(3000);

    // Try multiple selectors for download links
    const downloadSelectors = [
      'a.downloadBtn',
      'a[href*="download"]',
      'a.download-link',
      'a[download]',
      'video[src]'
    ];

    for (const selector of downloadSelectors) {
      const element = await page.$(selector);
      if (element) {
        const href = await page.evaluate(el => el.src || el.href, element);
        if (href && (href.startsWith('http') || href.startsWith('blob'))) {
          return href;
        }
      }
    }

    // If no direct download link, try to get video source
    const videoSrc = await page.evaluate(() => {
      const video = document.querySelector('video');
      return video ? video.src : null;
    });

    return videoSrc;
  } catch (error) {
    console.error(`Error extracting download link for ${videoUrl}:`, error);
    return null;
  }
}

app.post('/search', validateSearchQuery, async (req, res) => {
  const { query } = req.body;
  let browser;

  try {
    console.log('Searching with query:', query);
    
    // Launch browser
    browser = await puppeteer.launch({ 
      headless: true,
      args: CONFIG.BROWSER_ARGS
    });

    // Search for videos
    const searchResults = await pornhub.search(query, ['link', 'title']);
    
    console.log('Raw search results:', JSON.stringify(searchResults, null, 2));

    // Extract results from the response object
    const results = searchResults.results || [];

    // Limit number of videos
    const limitedResults = results.slice(0, CONFIG.MAX_VIDEOS);

    // Prepare zip file
    const zipPath = path.join(CONFIG.DOWNLOADS_DIR, `videos_${Date.now()}.zip`);
    const output = fs.createWriteStream(zipPath);
    const archive = archiver('zip', {
      zlib: { level: 9 }
    });

    archive.pipe(output);

    // Create a new page for download extraction
    const page = await browser.newPage();

    // Track download progress
    let downloadedVideos = 0;
    let failedVideos = 0;
    let totalDownloadSize = 0;

    // Download videos
    for (const video of limitedResults) {
      // Skip premium or invalid videos
      if (video.premium || !video.link || !video.link.startsWith('https://www.pornhub.com/')) {
        console.log(`Skipping video: ${video.title}`);
        failedVideos++;
        continue;
      }

      try {
        // Extract download link
        const downloadUrl = await extractVideoDownloadLink(page, video.link);

        if (!downloadUrl) {
          console.log(`No download URL for video: ${video.title}`);
          failedVideos++;
          continue;
        }

        // Download the video
        const response = await axios({
          method: 'get',
          url: downloadUrl,
          responseType: 'stream',
          timeout: CONFIG.DOWNLOAD_TIMEOUT,
          maxContentLength: CONFIG.MAX_VIDEO_SIZE
        });

        // Check content length
        const contentLength = parseInt(response.headers['content-length'], 10) || 0;
        totalDownloadSize += contentLength;

        if (totalDownloadSize > CONFIG.MAX_VIDEO_SIZE * CONFIG.MAX_VIDEOS) {
          console.warn('Total download size exceeded limit');
          break;
        }

        // Create a sanitized filename
        const sanitizedTitle = video.title
          .replace(/[^a-z0-9]/gi, '_')
          .toLowerCase()
          .substring(0, 50);
        
        // Add video to zip
        archive.append(response.data, { 
          name: `${sanitizedTitle}_${downloadedVideos + 1}.mp4` 
        });
        
        downloadedVideos++;
      } catch (videoError) {
        console.error(`Failed to download video: ${video.title}`, videoError.message);
        failedVideos++;
      }
    }

    // Close the browser
    await browser.close();

    // Finalize the archive
    await archive.finalize();

    // Send the zip file
    res.download(zipPath, `videos_${Date.now()}.zip`, (err) => {
      if (err) {
        console.error('Error sending zip:', err);
      }
      
      // Clean up the zip file after sending
      fs.unlink(zipPath, () => {});
    });

    console.log(`Download complete. Total videos: ${downloadedVideos}, Failed: ${failedVideos}`);

  } catch (error) {
    console.error('Comprehensive Error during search or download:', error);
    
    // Ensure browser is closed in case of error
    if (browser) {
      await browser.close();
    }
    
    res.status(500).send(`An error occurred: ${error.message}`);
  }
});

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// Serve index.html for any unknown routes (for client-side routing)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
