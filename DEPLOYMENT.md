# Deployment Guide

## Backend Deployment with PM2

### Prerequisites
1. Install PM2 globally:
   ```bash
   npm install -g pm2
   ```

2. Create and activate a virtual environment:
   ```bash
   python3 -m venv venv
   source venv/bin/activate  # On Linux/Mac
   # or
   venv\Scripts\activate     # On Windows
   ```

3. Install dependencies:
   ```bash
   pip install -r backend/requirements.txt
   ```

### Option 1: Using Ecosystem File (Recommended)

1. Edit `ecosystem.config.js` and update the interpreter path to your venv:
   ```javascript
   interpreter: "/absolute/path/to/your/venv/bin/python"
   ```

2. Start the backend:
   ```bash
   pm2 start ecosystem.config.js
   ```

3. Save PM2 configuration and enable startup:
   ```bash
   pm2 save
   pm2 startup
   # Run the command that PM2 prints (with sudo on Linux)
   ```

### Option 2: Direct Command

```bash
# Linux/Mac
pm2 start "gunicorn -w 4 -k gthread --threads 8 --timeout 120 -b 0.0.0.0:9091 wsgi:app" \
  --name traj-backend \
  --cwd backend \
  --interpreter /path/to/venv/bin/python \
  --time

# Windows (use waitress instead of gunicorn)
pip install waitress
pm2 start "waitress-serve --listen=0.0.0.0:9091 app:app" \
  --name traj-backend \
  --cwd backend \
  --interpreter python \
  --time
```

### PM2 Management Commands

```bash
# Check status
pm2 status

# View logs
pm2 logs traj-backend

# Restart
pm2 restart traj-backend

# Stop
pm2 stop traj-backend

# Delete
pm2 delete traj-backend

# Monitor
pm2 monit
```

## Frontend Deployment

### Development
```bash
cd frontend
npm start
# Runs on port 9001
```

### Production Build and Deploy

#### Option 1: Using Ecosystem File (Recommended - Deploys Both Backend + Frontend)
```bash
# 1. Build the frontend
cd frontend
npm run build
cd ..

# 2. Install serve globally (if not already installed)
npm install -g serve

# 3. Deploy both backend and frontend with PM2
pm2 start ecosystem.config.js

# 4. Save and enable startup
pm2 save
pm2 startup
```

#### Option 2: Frontend Only Commands
```bash
# Build the frontend
cd frontend
npm run build

# Serve with PM2
pm2 serve build 9001 --name traj-frontend --spa

# Or serve directly
npx serve -s build -l 9001
```

#### Option 3: Direct PM2 Command
```bash
# After building
pm2 start "serve -s build -l 9001" --name traj-frontend --cwd frontend
```

## Environment Configuration

### Backend (.env file in backend/)
```
SECRET_KEY=your_secret_key_here
JWT_SECRET_KEY=your_jwt_secret_key_here
OPENAI_API_KEY=your_openai_api_key_here
ALLOWED_EMAIL_SUFFIX=@turing.com
```

### Frontend Environment Variables
- **Development**: Set in `frontend/.env.development`
- **Production**: Set in `frontend/.env.production` or via build environment

```
REACT_APP_API_BASE_URL=http://your-backend-domain:9091
```

## Ports
- Backend: 9091
- Frontend: 9001

## Troubleshooting

1. **Gunicorn not found**: Make sure it's installed in your venv and use the full path to the venv's python
2. **Port in use**: Check if port 9091 is already in use: `sudo ss -tulpen | grep 9091`
3. **Permission denied**: Ensure your user has permission to bind to the port
4. **Module not found**: Verify the working directory is set to `backend/`
5. **Environment variables**: Check that `.env` file exists in `backend/` directory
