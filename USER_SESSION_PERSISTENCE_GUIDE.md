# User Session Persistence and Navigation State Management

This document explains the enhanced user session management system that keeps users logged in and remembers their navigation state.

## Overview

The system now provides:

1. **Persistent User Sessions** - Users stay logged in across browser sessions
2. **Navigation State Memory** - App remembers where users were when they return
3. **Activity Tracking** - Sessions stay active while users interact with the app
4. **Automatic Session Restoration** - Users return to their last visited page

## Key Features

### 1. User Session Persistence

**Files:** `auth.service.ts`

The AuthService now saves user sessions to localStorage with:

- User authentication data
- User profile information
- Login timestamp
- Last activity timestamp

**Session Expiry:**

- Sessions expire after 24 hours from login
- Sessions expire after 8 hours of inactivity
- Activity tracking keeps sessions alive during use

### 2. Navigation State Management

**Files:** `navigation-state.service.ts`

Tracks and persists:

- Last visited route
- Route history (last 10 routes)
- Tab selections for tab-based pages
- Page states (form data, filters, etc.)
- User role for route validation

**Features:**

- Automatic route tracking (excludes auth pages)
- Role-based route validation
- 24-hour state expiry
- Tab and page state preservation

### 3. Activity Tracking

**Files:** `activity-tracker.service.ts`

Monitors user interaction:

- Click, scroll, keypress, mousemove, touchstart events
- Updates activity timestamp every 5 minutes
- Keeps sessions alive during active use
- Automatic cleanup on logout

### 4. Startup Flow

**Files:** `home.page.ts`, `app-routing.module.ts`

**New App Startup Process:**

1. App starts and navigates to `/home` (instead of `/pages/auth/login`)
2. Home page checks for valid stored session
3. If valid session exists:
   - Restores user authentication state
   - Navigates to last visited route OR role-based dashboard
4. If no valid session:
   - Navigates to login page

## How It Works

### Session Storage Structure

```typescript
interface UserSession {
  user: User; // Firebase User object
  profile: UserProfile; // User profile from Firestore
  loginTimestamp: number; // When user logged in
  lastActivity: number; // Last user interaction
}
```

### Navigation State Structure

```typescript
interface UserNavigationState {
  lastVisitedRoute: string; // Last page visited
  routeHistory: string[]; // History of visited routes
  timestamp: number; // When state was updated
  userRole?: string; // User role for validation
  tabSelections?: { [page: string]: string }; // Tab selections per page
  pageStates?: { [page: string]: any }; // Form data, filters, etc.
}
```

### Storage Keys

- `handyhome_user_session` - User authentication session
- `handyhome_navigation_state` - Navigation and page state
- `userProfile_{uid}` - Cached user profiles (24h expiry)

## Usage Examples

### Saving Tab Selection

```typescript
// In any page component
constructor(private navigationState: NavigationStateService) {}

onTabChange(tabId: string) {
  this.navigationState.saveTabSelection('/pages/client/dashboard', tabId);
}

ngOnInit() {
  // Restore tab selection
  const savedTab = this.navigationState.getTabSelection('/pages/client/dashboard');
  if (savedTab) {
    this.selectedTab = savedTab;
  }
}
```

### Saving Page State

```typescript
// Save form data or filters
onFiltersChange(filters: any) {
  this.navigationState.savePageState('/pages/worker/job-listings', {
    filters: filters,
    searchTerm: this.searchTerm,
    sortBy: this.sortBy
  });
}

ngOnInit() {
  // Restore page state
  const savedState = this.navigationState.getPageState('/pages/worker/job-listings');
  if (savedState) {
    this.filters = savedState.filters || {};
    this.searchTerm = savedState.searchTerm || '';
    this.sortBy = savedState.sortBy || 'date';
  }
}
```

### Manual Session Update

```typescript
// Update user activity (done automatically by ActivityTrackerService)
this.authService.updateUserActivity();

// Check if user should auto-login
if (this.authService.shouldAutoLogin()) {
  // Valid session exists
}

// Navigate to appropriate start page
await this.authService.navigateToAppropriateStartPage();
```

## User Experience

### First Time Login

1. User enters credentials and logs in
2. System saves session and starts tracking navigation
3. User is taken to their role-based dashboard
4. All navigation is tracked automatically

### Returning User (Same Browser Session)

1. User closes app/tab and reopens
2. App automatically detects valid session
3. User is taken to their last visited page
4. Tab selections and page states are restored

### Returning User (New Browser Session)

1. User opens app in new browser/device
2. No stored session exists
3. User must log in again
4. Previous navigation state is not available

### Session Expiry

1. After 24 hours OR 8 hours of inactivity
2. Session automatically expires
3. User is redirected to login page
4. Navigation state is cleared

## Security Considerations

- Sessions have time limits (24h login, 8h inactivity)
- Navigation state validates routes against user roles
- Sensitive data is not stored in navigation state
- localStorage is cleared on explicit logout
- Auth pages are never tracked in navigation

## Benefits

1. **Better User Experience**: Users don't lose their place in the app
2. **Reduced Login Friction**: Stay logged in across sessions
3. **Preserved Context**: Tab selections and filters are remembered
4. **Smart Navigation**: Return to relevant pages based on user role
5. **Activity-Based Sessions**: Sessions stay alive during active use

## Testing

### Test Session Persistence

1. Login to the app
2. Navigate to various pages
3. Close browser completely
4. Reopen browser and navigate to app
5. Should return to last visited page (if session not expired)

### Test Navigation Memory

1. Login and navigate to a page with tabs
2. Select different tabs
3. Navigate to other pages
4. Return to original page
5. Tab selection should be preserved

### Test Activity Tracking

1. Login to the app
2. Remain active (clicking, scrolling) for several hours
3. Session should remain valid beyond 8 hours
4. Stop activity for 8+ hours
5. Session should expire

### Test Session Expiry

1. Login to the app
2. Wait 24+ hours (or modify expiry time for testing)
3. Try to access protected route
4. Should be redirected to login
