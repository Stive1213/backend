# LifeHub Backend API

A professional REST API backend for the LifeHub application with Google OAuth authentication.

## Features

- RESTful API architecture
- Google OAuth 2.0 authentication
- JWT token-based authentication
- Session management
- Rate limiting
- Security middleware (Helmet)
- SQLite database
- File upload support

## Environment Variables

Create a `.env` file in the `backend` directory with the following variables:

```env
# Server Configuration
PORT=5000
NODE_ENV=development

# JWT Configuration
JWT_SECRET=your-secret-key-change-in-production

# Session Configuration
SESSION_SECRET=estifanos121212

# Google OAuth Configuration
GOOGLE_CLIENT_ID=62754739601-6m3at2ubmtifo436o8hetinv40gi62v1.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=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
GOOGLE_CALLBACK_URL=http://localhost:5000/auth/google/callback

# Frontend URL (for CORS)
FRONTEND_URL=http://localhost:5173

# Gemini AI Configuration (Backend Only - Never expose to frontend)
GEMINI_API_KEY=your-gemini-api-key-here
```

## Installation

```bash
npm install
```

## Running the Server

```bash
npm start
```

The server will run on `http://localhost:5000` (or the port specified in `.env`).

## API Endpoints

### Authentication

- `POST /api/auth/signup` - Register a new user
- `POST /api/auth/login` - Login with username/password
- `GET /auth/google` - Initiate Google OAuth flow
- `GET /auth/google/callback` - Google OAuth callback
- `GET /api/auth/user` - Get current user profile (protected)
- `PUT /api/auth/user` - Update user profile (protected)

### Other Endpoints

See individual route files in `src/routes/` for complete API documentation.

## Project Structure

```
backend/
├── src/
│   ├── config/          # Configuration files
│   │   ├── config.js    # Environment configuration
│   │   ├── db.js        # Database setup
│   │   └── passport.js  # Passport.js OAuth strategy
│   ├── controllers/     # Request handlers
│   ├── middleware/      # Custom middleware
│   │   ├── auth.js      # JWT authentication
│   │   ├── errorHandler.js
│   │   └── rateLimiter.js
│   ├── routes/          # API routes
│   ├── services/        # Business logic
│   │   └── authService.js
│   ├── utils/           # Utility functions
│   │   └── logger.js
│   └── index.js         # Application entry point
├── uploads/             # File uploads directory
└── package.json
```

## Security Features

- Helmet.js for security headers
- Rate limiting on API endpoints
- CORS configuration
- JWT token authentication
- Password hashing with bcrypt
- Session management
- Input validation

## Database

The application uses SQLite3. The database file (`life_management.db`) is created automatically on first run.

## Development

The server uses `nodemon` for automatic restart during development.

