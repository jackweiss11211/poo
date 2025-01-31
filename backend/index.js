const express = require('express');
const archiver = require('archiver');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');

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
  ],
  CHROME_PATHS: [
    // Possible Chrome executable paths
    '/usr/bin/google-chrome',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    process.env.CHROME_EXECUTABLE_PATH // Allow environment override
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

// Function to find Chrome executable
function findChromePath() {
  const chromePaths = [
    process.env.CHROME_EXECUTABLE_PATH || '/usr/bin/google-chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium'
  ];

  console.log('Searching Chrome paths:', chromePaths);

  for (const chromePath of chromePaths) {
    try {
      if (chromePath && fs.existsSync(chromePath)) {
        console.log(`Found Chrome executable at: ${chromePath}`);
        return chromePath;
      }
    } catch (error) {
      console.warn(`Chrome path check failed for: ${chromePath}`, error);
    }
  }
  
  console.error('Chrome executable not found. Environment details:');
  console.error('Process env:', JSON.stringify(process.env, null, 2));
  
  return null;
}

// Updated browser launch configuration
const launchBrowser = async () => {
  try {
    // Dynamically import puppeteer
    const puppeteerModule = await import('puppeteer');
    const puppeteer = puppeteerModule.default;
    
    const chromePath = findChromePath();
    
    if (!chromePath) {
      throw new Error('No Chrome executable found. Please install Chrome.');
    }

    console.log(`Attempting to launch browser from: ${chromePath}`);

    const browser = await puppeteer.launch({
      executablePath: chromePath,
      headless: true,
      args: [
        '--no-sandbox', 
        '--disable-setuid-sandbox', 
        '--disable-dev-shm-usage'
      ]
    });

    return browser;
  } catch (error) {
    console.error('Browser launch error:', error);
    
    // Log detailed error information
    console.error('Full error details:', {
      message: error.message,
      stack: error.stack,
      code: error.code
    });
    
    // Optionally, implement a fallback search method or skip browser-dependent functionality
    throw error;
  }
};

// Function to search videos using Puppeteer
async function searchVideos(browser, query) {
  const page = await browser.newPage();
  
  try {
    // Navigate to Pornhub search page
    await page.goto(`https://www.pornhub.com/video/search?search=${encodeURIComponent(query)}`, {
      waitUntil: 'networkidle0',
      timeout: CONFIG.DOWNLOAD_TIMEOUT
    });

    // Extract video information
    const videos = await page.evaluate(() => {
      const videoElements = document.querySelectorAll('.videoBox');
      return Array.from(videoElements).slice(0, 10).map(el => {
        const titleEl = el.querySelector('.title a');
        const linkEl = el.querySelector('a.linkVideoThumb');
        
        return {
          title: titleEl ? titleEl.textContent.trim() : 'Untitled',
          link: linkEl ? `https://www.pornhub.com${linkEl.getAttribute('href')}` : null,
          views: el.querySelector('.views .count') ? 
            el.querySelector('.views .count').textContent.trim() : '0',
          premium: el.querySelector('.premiumIcon') !== null
        };
      });
    });

    return { results: videos };
  } catch (error) {
    console.error('Error searching videos:', error);
    return { results: [] };
  } finally {
    await page.close();
  }
}

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
    browser = await launchBrowser();
    console.log('Searching with query:', query);
    
    // Search for videos
    const searchResults = await searchVideos(browser, query);
    
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
    console.error('Search error:', error);
    return res.status(500).json({ 
      error: 'Failed to perform search. Please try again later.',
      details: error.message 
    });
  } finally {
    if (browser) {
      await browser.close();
    }
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
