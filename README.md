# HandyHome

A mobile and web application built with Ionic Angular for home service management and booking.

## 📱 About

HandyHome is a comprehensive service booking platform that connects clients with skilled workers for various home services. The application features location-based worker matching, real-time booking management, and integrated mapping capabilities.

## 🚀 Quick Start

### Prerequisites

Before running this project, ensure you have the following installed:

- **Node.js** (version 18 or higher) - [Download here](https://nodejs.org/)
- **npm** (comes with Node.js)
- **Ionic CLI** - Install globally: `npm install -g @ionic/cli`
- **Angular CLI** - Install globally: `npm install -g @angular/cli`
- **Git** - [Download here](https://git-scm.com/)
- **GitHub Desktop** (optional) - [Download here](https://desktop.github.com/)

### Installation

1. **Clone the repository**

   ```bash
   git clone https://github.com/your-username/HandyHome.git
   cd HandyHome
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Set up environment variables**
   - Copy `src/environments/environment.ts` to `src/environments/environment.prod.ts` if not exists
   - Configure Firebase settings and other environment variables as needed

## 🏃‍♂️ Running the Application

### Development Server

To start the development server:

```bash
# Start the Ionic development server
ionic serve

# Or use Angular CLI
ng serve
```

The application will be available at `http://localhost:8100` by default.

### Available Scripts

- `npm start` - Start the development server
- `npm run build` - Build the project for production
- `npm run watch` - Build and watch for changes
- `npm test` - Run unit tests
- `npm run lint` - Run linting

### Mobile Development

#### For iOS (macOS only)

```bash
# Add iOS platform
ionic capacitor add ios

# Build and sync
ionic capacitor build ios

# Open in Xcode
ionic capacitor open ios
```

#### For Android

```bash
# Add Android platform
ionic capacitor add android

# Build and sync
ionic capacitor build android

# Open in Android Studio
ionic capacitor open android
```

## 🐙 Using GitHub Desktop

### Initial Setup

1. **Download and Install GitHub Desktop**

   - Go to [desktop.github.com](https://desktop.github.com/)
   - Download and install for Windows

2. **Sign in to GitHub**

   - Open GitHub Desktop
   - Sign in with your GitHub account

3. **Clone Repository**
   - Click "Clone a repository from the Internet"
   - Select the HandyHome repository
   - Choose local path: `C:\Users\[YourUsername]\Desktop\New folder\HandyHome`

### Daily Workflow with GitHub Desktop

#### Making Changes

1. **Open GitHub Desktop**
2. **Make your code changes** in VS Code or your preferred editor
3. **Review changes** in GitHub Desktop:
   - View modified files in the left panel
   - See line-by-line differences in the main panel

#### Committing Changes

1. **Stage changes** by checking files you want to commit
2. **Write commit message**:
   - Summary (required): Brief description of changes
   - Description (optional): Detailed explanation
3. **Click "Commit to main"** (or your current branch)

#### Pushing to GitHub

1. **Click "Push origin"** to upload commits to GitHub
2. If prompted, authenticate with GitHub

#### Pulling Updates

1. **Click "Fetch origin"** to check for updates
2. **Click "Pull origin"** if updates are available

#### Creating Branches

1. **Click "Current Branch"** dropdown
2. **Click "New Branch"**
3. **Name your branch** (e.g., `feature/new-booking-system`)
4. **Click "Create Branch"**

#### Creating Pull Requests

1. **Push your branch** to GitHub
2. **Click "Create Pull Request"** in GitHub Desktop
3. **Fill out PR details** in the web browser
4. **Submit for review**

### Useful GitHub Desktop Tips

- **View History**: Click "History" tab to see commit timeline
- **Discard Changes**: Right-click modified files → "Discard changes"
- **Stash Changes**: Use if you need to switch branches with uncommitted changes
- **Compare Branches**: See differences between branches in the branch dropdown

## 🔧 Development Tools

### VS Code Extensions (Recommended)

- Angular Language Service
- Ionic Extension Pack
- TypeScript Hero
- Auto Rename Tag
- Bracket Pair Colorizer
- GitLens

### Project Structure

```
src/
├── app/
│   ├── components/       # Reusable components
│   ├── guards/          # Route guards
│   ├── pages/           # Application pages
│   ├── services/        # Business logic services
│   └── modules/         # Feature modules
├── assets/              # Static assets
├── environments/        # Environment configurations
└── theme/              # Global styling
```

## 🔥 Firebase Setup

1. **Create Firebase Project**

   - Go to [Firebase Console](https://console.firebase.google.com/)
   - Create new project or use existing

2. **Configure Firebase**

   - Update `src/environments/environment.ts` with your Firebase config
   - Enable Authentication, Firestore, and other required services

3. **Install Firebase Tools** (if needed)
   ```bash
   npm install -g firebase-tools
   firebase login
   ```

## 📱 Features

- **User Authentication** - Secure login/registration
- **Service Booking** - Book various home services
- **Worker Matching** - Location-based worker discovery
- **Real-time Tracking** - Track service progress
- **Map Integration** - Leaflet-powered mapping
- **Responsive Design** - Works on mobile and desktop

## 🚨 Troubleshooting

### Common Issues

**Port already in use:**

```bash
# Kill process on port 8100
netstat -ano | findstr :8100
taskkill /PID <PID_NUMBER> /F
```

**Node modules issues:**

```bash
# Clear npm cache and reinstall
npm cache clean --force
rm -rf node_modules package-lock.json
npm install
```

**Capacitor sync issues:**

```bash
# Clean and rebuild
ionic capacitor clean
ionic capacitor sync
```

**GitHub Desktop not detecting changes:**

- Ensure you're in the correct repository
- Check if `.git` folder exists
- Restart GitHub Desktop

## 📞 Support

For issues and questions:

- Check existing [GitHub Issues](https://github.com/your-username/HandyHome/issues)
- Create new issue with detailed description
- Include error messages and steps to reproduce

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

---

**Happy coding! 🎉**

For more information about Ionic and Angular, visit:

- [Ionic Documentation](https://ionicframework.com/docs)
- [Angular Documentation](https://angular.io/docs)
- [Capacitor Documentation](https://capacitorjs.com/docs)
