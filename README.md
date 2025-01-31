# Video Search & Download Backend

## Deployment on Render

### Prerequisites
- Render Account
- GitHub Repository
- Node.js 18.x

### Deployment Steps
1. Fork this repository to your GitHub
2. Create a new Web Service on Render
3. Connect your GitHub repository
4. Configure Build Settings:
   - Build Command: `cd backend && npm install`
   - Start Command: `cd backend && npm start`

### Environment Variables
Set these in Render's environment settings:
- `PORT`: 10000
- `NODE_ENV`: production
- `CHROME_EXECUTABLE_PATH`: `/usr/bin/google-chrome`

### Local Development
1. Clone the repository
2. Navigate to backend directory
3. Run `npm install`
4. Run `npm start`

### Troubleshooting
- Ensure Chrome is installed in the deployment environment
- Check Render logs for any specific errors
- Verify all dependencies are correctly installed

## Note
This application is for educational purposes only.
