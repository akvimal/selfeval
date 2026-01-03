# SelfEval - AI-Powered Learning Platform

SelfEval is an AI-powered learning and assessment platform that helps learners practice concepts through dynamically generated questions and simulated interviews.

## Features

- **AI-Generated Questions**: Multiple question types (MCQ, True/False, Concept, Comparison, Fill-in-the-blank)
- **Mock Interviews**: AI-powered interview simulations with various personas and roles
- **Performance Tracking**: Detailed analytics for learners and administrators
- **Course Management**: Create and manage courses with topics and subtopics
- **Admin Dashboard**: User management, analytics, dispute resolution, and settings
- **Question Caching**: Reduces API costs by caching generated questions
- **Multi-Provider AI**: Supports Groq (free) and Anthropic Claude models

## Prerequisites

- Node.js 18.x or higher
- npm or yarn
- Groq API key (free) or Anthropic API key

## Local Development

### 1. Clone the repository

```bash
git clone https://github.com/akvimal/selfeval.git
cd selfeval
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

Create a `.env` file in the root directory:

```env
# Required: At least one AI provider
GROQ_API_KEY=your_groq_api_key_here
# ANTHROPIC_API_KEY=your_anthropic_api_key_here

# Optional: Email configuration (for verification and password reset)
# SMTP_HOST=smtp.gmail.com
# SMTP_PORT=587
# SMTP_USER=your-email@gmail.com
# SMTP_PASS=your-app-password
# SMTP_FROM=noreply@yourapp.com

# Application settings
APP_URL=http://localhost:3000
PORT=3000
```

### 4. Start the server

```bash
# Production
npm start

# Development (with auto-reload)
npm run dev
```

The application will be available at `http://localhost:3000`

### Default Admin Account

On first run, a default admin account is created:
- **Email**: admin@selfeval.com
- **Password**: admin123

> **Important**: Change the admin password after first login.

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GROQ_API_KEY` | Yes* | Groq API key for AI features |
| `ANTHROPIC_API_KEY` | Yes* | Anthropic API key for Claude models |
| `PORT` | No | Server port (default: 3000) |
| `APP_URL` | No | Application URL for email links |
| `SMTP_HOST` | No | SMTP server hostname |
| `SMTP_PORT` | No | SMTP server port |
| `SMTP_USER` | No | SMTP username |
| `SMTP_PASS` | No | SMTP password |
| `SMTP_FROM` | No | From address for emails |

*At least one AI provider API key is required.

---

## Deploy to Google Cloud Platform (GCP)

### Option 1: Cloud Run (Recommended)

Cloud Run is serverless, auto-scaling, and cost-effective for variable traffic.

#### Prerequisites
- [Google Cloud SDK](https://cloud.google.com/sdk/docs/install) installed
- Docker installed
- GCP project with billing enabled

#### Step 1: Create a Dockerfile

Create a `Dockerfile` in the project root:

```dockerfile
FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy application files
COPY . .

# Create data directory for SQLite
RUN mkdir -p /app/data

# Expose port
EXPOSE 8080

# Set environment variable for Cloud Run
ENV PORT=8080

# Start the application
CMD ["npm", "start"]
```

Create a `.dockerignore` file:

```
node_modules
.env
data/*.db
.git
.gitignore
README.md
```

#### Step 2: Build and deploy

```bash
# Set your project ID
export PROJECT_ID=your-gcp-project-id
export REGION=us-central1

# Authenticate with GCP
gcloud auth login
gcloud config set project $PROJECT_ID

# Enable required APIs
gcloud services enable cloudbuild.googleapis.com run.googleapis.com

# Build and push container image
gcloud builds submit --tag gcr.io/$PROJECT_ID/selfeval

# Deploy to Cloud Run
gcloud run deploy selfeval \
  --image gcr.io/$PROJECT_ID/selfeval \
  --platform managed \
  --region $REGION \
  --allow-unauthenticated \
  --set-env-vars "GROQ_API_KEY=your_groq_api_key" \
  --set-env-vars "APP_URL=https://your-service-url.run.app" \
  --memory 512Mi \
  --cpu 1 \
  --min-instances 0 \
  --max-instances 10
```

#### Step 3: Configure persistent storage (optional)

For production, use Cloud SQL or Cloud Storage instead of SQLite:

```bash
# Mount a Cloud Storage bucket for data persistence
gcloud run deploy selfeval \
  --image gcr.io/$PROJECT_ID/selfeval \
  --execution-environment gen2 \
  --add-volume name=data,type=cloud-storage,bucket=your-bucket-name \
  --add-volume-mount volume=data,mount-path=/app/data
```

---

### Option 2: Compute Engine (VM)

Best for consistent traffic and full server control.

#### Step 1: Create a VM instance

```bash
# Create a VM with Node.js
gcloud compute instances create selfeval-vm \
  --zone=us-central1-a \
  --machine-type=e2-small \
  --image-family=ubuntu-2204-lts \
  --image-project=ubuntu-os-cloud \
  --tags=http-server,https-server \
  --boot-disk-size=20GB

# Allow HTTP/HTTPS traffic
gcloud compute firewall-rules create allow-http \
  --allow tcp:80,tcp:443,tcp:3000 \
  --target-tags=http-server,https-server
```

#### Step 2: SSH into the VM and setup

```bash
# SSH into the VM
gcloud compute ssh selfeval-vm --zone=us-central1-a

# Install Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install PM2 for process management
sudo npm install -g pm2

# Clone and setup the application
git clone https://github.com/akvimal/selfeval.git
cd selfeval
npm install

# Create .env file
cat > .env << EOF
GROQ_API_KEY=your_groq_api_key
APP_URL=http://YOUR_VM_EXTERNAL_IP:3000
PORT=3000
EOF

# Start with PM2
pm2 start server.js --name selfeval
pm2 save
pm2 startup
```

#### Step 3: Setup Nginx reverse proxy (optional)

```bash
sudo apt install -y nginx

sudo tee /etc/nginx/sites-available/selfeval << EOF
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
    }
}
EOF

sudo ln -s /etc/nginx/sites-available/selfeval /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

---

### Option 3: App Engine

Best for simple deployments with automatic scaling.

#### Step 1: Create app.yaml

```yaml
runtime: nodejs18

instance_class: F2

env_variables:
  GROQ_API_KEY: "your_groq_api_key"
  APP_URL: "https://your-project-id.appspot.com"

automatic_scaling:
  min_instances: 0
  max_instances: 5
  target_cpu_utilization: 0.65
```

#### Step 2: Deploy

```bash
# Initialize App Engine (first time only)
gcloud app create --region=us-central

# Deploy
gcloud app deploy

# View the app
gcloud app browse
```

> **Note**: App Engine standard environment doesn't support persistent file storage. Use Cloud SQL or Firestore for production databases.

---

## Production Considerations

### Database

SQLite is suitable for development and small deployments. For production, consider:

- **Cloud SQL (PostgreSQL/MySQL)**: Managed relational database
- **Firestore**: NoSQL document database
- **Cloud Storage**: For file-based data with Cloud Run volume mounts

### Security

1. **Change default admin password** immediately after deployment
2. **Enable HTTPS** using Cloud Run (automatic) or Let's Encrypt
3. **Set secure session secrets** in production
4. **Use Secret Manager** for API keys:

```bash
# Store secrets
echo -n "your_groq_api_key" | gcloud secrets create groq-api-key --data-file=-

# Use in Cloud Run
gcloud run deploy selfeval \
  --set-secrets "GROQ_API_KEY=groq-api-key:latest"
```

### Monitoring

```bash
# View Cloud Run logs
gcloud logging read "resource.type=cloud_run_revision" --limit=50

# Set up alerting
gcloud alpha monitoring policies create --policy-from-file=alerting-policy.yaml
```

## Project Structure

```
selfeval/
├── server.js           # Main application entry
├── routes/             # API route handlers
│   ├── admin.js        # Admin endpoints
│   ├── auth.js         # Authentication
│   ├── courses.js      # Course management
│   ├── interview.js    # Interview sessions
│   └── ...
├── services/           # Business logic
│   ├── database.js     # SQLite operations
│   ├── groq.js         # AI service integration
│   └── storage.js      # File storage
├── middleware/         # Express middleware
├── public/             # Frontend files
├── data/               # SQLite databases & JSON files
└── prompts/            # AI prompt templates
```

## License

MIT License
