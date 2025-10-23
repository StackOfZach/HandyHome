import { Injectable, inject } from '@angular/core';
import {
  Auth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  User,
  onAuthStateChanged,
} from '@angular/fire/auth';
import {
  Firestore,
  doc,
  setDoc,
  getDoc,
  updateDoc,
  DocumentData,
} from '@angular/fire/firestore';
import { Router } from '@angular/router';
import { BehaviorSubject, Observable } from 'rxjs';
import { NavigationStateService } from './navigation-state.service';

export interface UserLocation {
  id: string;
  contactPerson: string;
  phoneNumber: string;
  fullAddress: string;
  coordinates?: {
    latitude: number;
    longitude: number;
  };
  isDefault?: boolean;
  createdAt: Date;
}

export interface UserProfile {
  uid: string;
  fullName: string;
  email: string;
  phone: string;
  role: 'client' | 'worker' | 'admin';
  services?: string[]; // For workers
  savedLocations?: UserLocation[]; // User's saved addresses
  verificationStatus?: 'not_submitted' | 'pending' | 'approved' | 'rejected'; // For clients
  verificationSubmittedAt?: Date;
  verificationApprovedAt?: Date;
  verificationRejectedAt?: Date;
  createdAt: Date;
}

export interface UserSession {
  user: User;
  profile: UserProfile;
  loginTimestamp: number;
  lastActivity: number;
}

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private auth = inject(Auth);
  private firestore = inject(Firestore);
  private router = inject(Router);
  private navigationState = inject(NavigationStateService);

  private readonly USER_SESSION_KEY = 'handyhome_user_session';
  private readonly SESSION_EXPIRY_HOURS = 24;

  private currentUserSubject = new BehaviorSubject<User | null>(null);
  public currentUser$ = this.currentUserSubject.asObservable();

  private userProfileSubject = new BehaviorSubject<UserProfile | null>(null);
  public userProfile$ = this.userProfileSubject.asObservable();

  private isAuthInitialized = false;
  private authInitializedPromise: Promise<void>;

  constructor() {
    // Initialize auth state listener and restore session
    this.authInitializedPromise = this.initializeAuth();
  }

  private async initializeAuth(): Promise<void> {
    try {
      // First, try to restore from stored session
      await this.restoreUserSession();

      // Firebase Auth automatically persists to localStorage by default
      // No need to explicitly set persistence in AngularFire

      // Listen to auth state changes with error handling
      onAuthStateChanged(
        this.auth,
        async (user) => {
          try {
            console.log('Auth state changed:', user ? user.uid : 'null');
            this.currentUserSubject.next(user);

            if (user) {
              const profile = await this.getUserProfile(user.uid);
              this.userProfileSubject.next(profile);

              if (profile) {
                // Save user session and update navigation state
                this.saveUserSession(user, profile);
                this.navigationState.setUserRole(profile.role);

                // Update last activity
                this.updateLastActivity();
              }
            } else {
              this.userProfileSubject.next(null);
              // Clear session when user logs out
              this.clearUserSession();
            }
          } catch (error) {
            console.error('Error in auth state change handler:', error);
            // Don't clear auth state on profile fetch errors
            if (!user) {
              this.currentUserSubject.next(null);
              this.userProfileSubject.next(null);
            }
          }
        },
        (error) => {
          console.error('Auth state change error:', error);
        }
      );

      this.isAuthInitialized = true;
    } catch (error) {
      console.error('Error initializing auth:', error);
      this.isAuthInitialized = true; // Still mark as initialized to not block the app
    }
  }

  /**
   * Wait for auth to be initialized before performing operations
   */
  async waitForAuthInitialization(): Promise<void> {
    await this.authInitializedPromise;
  }

  /**
   * Sign up a new user with email and password
   */
  async signup(
    email: string,
    password: string,
    fullName: string,
    phone: string,
    role: 'client' | 'worker'
  ): Promise<void> {
    try {
      const userCredential = await createUserWithEmailAndPassword(
        this.auth,
        email,
        password
      );
      const user = userCredential.user;

      // Create user profile in Firestore
      const userProfile: UserProfile = {
        uid: user.uid,
        fullName,
        email,
        phone,
        role,
        createdAt: new Date(),
      };

      // Only add services field for workers
      if (role === 'worker') {
        userProfile.services = [];
      }

      // Add verification status for clients
      if (role === 'client') {
        userProfile.verificationStatus = 'not_submitted';
      }

      await setDoc(doc(this.firestore, 'users', user.uid), userProfile);
      this.userProfileSubject.next(userProfile);

      // Don't auto-redirect for clients - let the signup page handle it
      if (role !== 'client') {
        await this.redirectBasedOnRole(role);
      }
    } catch (error) {
      console.error('Signup error:', error);
      throw error;
    }
  }

  /**
   * Sign in with email and password
   */
  async login(email: string, password: string): Promise<void> {
    try {
      await this.waitForAuthInitialization();

      const userCredential = await signInWithEmailAndPassword(
        this.auth,
        email,
        password
      );
      const user = userCredential.user;

      // Wait a bit for auth state to propagate
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Get user profile
      const profile = await this.getUserProfile(user.uid);
      if (profile) {
        // Check verification status for clients
        if (profile.role === 'client') {
          if (profile.verificationStatus === 'not_submitted') {
            // Client needs to complete verification
            throw new Error('Please complete your account verification first.');
          } else if (profile.verificationStatus === 'pending') {
            // Client verification is under review
            throw new Error(
              'Your account verification is pending. Please wait for admin approval.'
            );
          } else if (profile.verificationStatus === 'rejected') {
            // Client verification was rejected
            throw new Error(
              'Your account verification was rejected. Please contact support.'
            );
          }
          // If approved, continue with login
        }

        // Save session and set navigation state
        this.saveUserSession(user, profile);
        this.navigationState.setUserRole(profile.role);

        console.log('Login successful, user role:', profile.role);

        // For fresh logins, always redirect to appropriate dashboard
        // Skip last visited route to ensure proper role-based redirection
        await this.redirectBasedOnRole(profile.role);
      }
    } catch (error) {
      console.error('Login error:', error);
      throw error;
    }
  }

  /**
   * Sign out the current user
   */
  async logout(): Promise<void> {
    try {
      const currentUser = this.getCurrentUser();

      await signOut(this.auth);
      this.currentUserSubject.next(null);
      this.userProfileSubject.next(null);

      // Clear cached profile data
      if (currentUser) {
        this.clearCachedUserProfile(currentUser.uid);
      }

      // Clear user session and navigation state
      this.clearUserSession();

      this.router.navigate(['/pages/auth/login']);
    } catch (error) {
      console.error('Logout error:', error);
      throw error;
    }
  }

  /**
   * Clear cached user profile
   */
  private clearCachedUserProfile(uid: string): void {
    try {
      localStorage.removeItem(`userProfile_${uid}`);
    } catch (error) {
      console.error('Error clearing cached user profile:', error);
    }
  }

  /**
   * Get user profile from Firestore with local caching
   */
  async getUserProfile(uid: string): Promise<UserProfile | null> {
    try {
      // First check if we have a cached profile for this user
      const cachedProfile = this.getCachedUserProfile(uid);

      // Try to get fresh data from Firestore
      const userDoc = await getDoc(doc(this.firestore, 'users', uid));
      if (userDoc.exists()) {
        const data = userDoc.data() as DocumentData;
        const profile = {
          ...data,
          createdAt: data['createdAt']?.toDate() || new Date(),
        } as UserProfile;

        // Cache the profile
        this.cacheUserProfile(profile);
        return profile;
      }

      // If no document exists but we have cached data, return cached
      if (cachedProfile) {
        console.log('Using cached profile due to missing document');
        return cachedProfile;
      }

      return null;
    } catch (error) {
      console.error('Get user profile error:', error);

      // On error, try to return cached profile
      const cachedProfile = this.getCachedUserProfile(uid);
      if (cachedProfile) {
        console.log('Using cached profile due to error');
        return cachedProfile;
      }

      return null;
    }
  }

  /**
   * Cache user profile in local storage
   */
  private cacheUserProfile(profile: UserProfile): void {
    try {
      const cacheData = {
        profile,
        timestamp: Date.now(),
        expiresAt: Date.now() + 24 * 60 * 60 * 1000, // 24 hours
      };
      localStorage.setItem(
        `userProfile_${profile.uid}`,
        JSON.stringify(cacheData)
      );
    } catch (error) {
      console.error('Error caching user profile:', error);
    }
  }

  /**
   * Get cached user profile from local storage
   */
  private getCachedUserProfile(uid: string): UserProfile | null {
    try {
      const cached = localStorage.getItem(`userProfile_${uid}`);
      if (cached) {
        const cacheData = JSON.parse(cached);

        // Check if cache is still valid (24 hours)
        if (Date.now() < cacheData.expiresAt) {
          return {
            ...cacheData.profile,
            createdAt: new Date(cacheData.profile.createdAt),
          } as UserProfile;
        } else {
          // Remove expired cache
          localStorage.removeItem(`userProfile_${uid}`);
        }
      }
    } catch (error) {
      console.error('Error getting cached user profile:', error);
    }
    return null;
  }

  /**
   * Check if user is authenticated
   */
  isAuthenticated(): boolean {
    return this.currentUserSubject.value !== null;
  }

  /**
   * Check if user is authenticated with fallback to cached data
   */
  isAuthenticatedWithFallback(): boolean {
    // First check current auth state
    if (this.isAuthenticated()) {
      return true;
    }

    // If no current user, check if we have any cached profile data
    // This helps maintain session during temporary network issues
    try {
      const keys = Object.keys(localStorage);
      const hasUserProfile = keys.some((key) => key.startsWith('userProfile_'));
      return hasUserProfile;
    } catch (error) {
      console.error('Error checking cached auth state:', error);
      return false;
    }
  }

  /**
   * Get current user
   */
  getCurrentUser(): User | null {
    return this.currentUserSubject.value;
  }

  /**
   * Get current user profile
   */
  getCurrentUserProfile(): UserProfile | null {
    return this.userProfileSubject.value;
  }

  /**
   * Redirect user based on their role
   */
  private async redirectBasedOnRole(
    role: 'client' | 'worker' | 'admin'
  ): Promise<void> {
    console.log('Redirecting based on role:', role);

    switch (role) {
      case 'client':
        console.log('Navigating to client dashboard');
        this.router.navigate(['/pages/client/dashboard']);
        break;
      case 'worker':
        // Check if worker has completed interview
        const currentUser = this.getCurrentUser();
        if (currentUser) {
          const { WorkerService } = await import('./worker.service');
          const workerService = new (WorkerService as any)(this.firestore);
          const hasCompleted = await workerService.hasCompletedInterview(
            currentUser.uid
          );
          const isVerified = await workerService.isWorkerVerified(
            currentUser.uid
          );

          if (!hasCompleted) {
            // Redirect to interview if not completed
            console.log('Worker needs to complete interview');
            this.router.navigate(['/pages/worker/interview']);
          } else if (!isVerified) {
            // Worker completed interview but not verified yet
            console.log('Worker verification pending');
            // Sign out the user and throw error to show verification message
            await this.logout();
            throw new Error('WORKER_NOT_VERIFIED');
          } else {
            // Worker is verified, go to dashboard
            console.log('Navigating to worker dashboard');
            this.router.navigate(['/pages/worker/dashboard']);
          }
        } else {
          console.log('No current user found for worker role');
          this.router.navigate(['/pages/auth/login']);
        }
        break;
      case 'admin':
        console.log('Navigating to admin dashboard');
        this.router.navigate(['/pages/admin/dashboard']);
        break;
      default:
        console.log('Unknown role, redirecting to login');
        this.router.navigate(['/pages/auth/login']);
    }
  }

  // Location Management Methods

  /**
   * Save a new location to user's profile
   */
  async saveUserLocation(
    location: Omit<UserLocation, 'id' | 'createdAt'>
  ): Promise<UserLocation | null> {
    try {
      const currentUser = this.getCurrentUser();
      const currentProfile = this.getCurrentUserProfile();

      if (!currentUser || !currentProfile) {
        throw new Error('User not authenticated');
      }

      const newLocation: UserLocation = {
        ...location,
        id: Date.now().toString(),
        createdAt: new Date(),
      };

      const updatedLocations = [
        ...(currentProfile.savedLocations || []),
        newLocation,
      ];

      // If this is the first location, make it default
      if (updatedLocations.length === 1) {
        newLocation.isDefault = true;
      }

      const userDocRef = doc(this.firestore, 'users', currentUser.uid);
      await updateDoc(userDocRef, {
        savedLocations: updatedLocations,
      });

      // Update local profile
      const updatedProfile = {
        ...currentProfile,
        savedLocations: updatedLocations,
      };
      this.userProfileSubject.next(updatedProfile);

      return newLocation;
    } catch (error) {
      console.error('Error saving user location:', error);
      return null;
    }
  }

  /**
   * Update an existing user location
   */
  async updateUserLocation(
    locationId: string,
    updates: Partial<Omit<UserLocation, 'id' | 'createdAt'>>
  ): Promise<boolean> {
    try {
      const currentUser = this.getCurrentUser();
      const currentProfile = this.getCurrentUserProfile();

      if (!currentUser || !currentProfile || !currentProfile.savedLocations) {
        throw new Error('User not authenticated or no locations found');
      }

      const updatedLocations = currentProfile.savedLocations.map((location) =>
        location.id === locationId ? { ...location, ...updates } : location
      );

      const userDocRef = doc(this.firestore, 'users', currentUser.uid);
      await updateDoc(userDocRef, {
        savedLocations: updatedLocations,
      });

      // Update local profile
      const updatedProfile = {
        ...currentProfile,
        savedLocations: updatedLocations,
      };
      this.userProfileSubject.next(updatedProfile);

      return true;
    } catch (error) {
      console.error('Error updating user location:', error);
      return false;
    }
  }

  /**
   * Delete a user location
   */
  async deleteUserLocation(locationId: string): Promise<boolean> {
    try {
      const currentUser = this.getCurrentUser();
      const currentProfile = this.getCurrentUserProfile();

      if (!currentUser || !currentProfile || !currentProfile.savedLocations) {
        throw new Error('User not authenticated or no locations found');
      }

      let updatedLocations = currentProfile.savedLocations.filter(
        (location) => location.id !== locationId
      );

      // If we deleted the default location, make the first one default
      if (
        updatedLocations.length > 0 &&
        !updatedLocations.some((loc) => loc.isDefault)
      ) {
        updatedLocations[0].isDefault = true;
      }

      const userDocRef = doc(this.firestore, 'users', currentUser.uid);
      await updateDoc(userDocRef, {
        savedLocations: updatedLocations,
      });

      // Update local profile
      const updatedProfile = {
        ...currentProfile,
        savedLocations: updatedLocations,
      };
      this.userProfileSubject.next(updatedProfile);

      return true;
    } catch (error) {
      console.error('Error deleting user location:', error);
      return false;
    }
  }

  /**
   * Set a location as default
   */
  async setDefaultLocation(locationId: string): Promise<boolean> {
    try {
      const currentUser = this.getCurrentUser();
      const currentProfile = this.getCurrentUserProfile();

      if (!currentUser || !currentProfile || !currentProfile.savedLocations) {
        throw new Error('User not authenticated or no locations found');
      }

      const updatedLocations = currentProfile.savedLocations.map(
        (location) => ({
          ...location,
          isDefault: location.id === locationId,
        })
      );

      const userDocRef = doc(this.firestore, 'users', currentUser.uid);
      await updateDoc(userDocRef, {
        savedLocations: updatedLocations,
      });

      // Update local profile
      const updatedProfile = {
        ...currentProfile,
        savedLocations: updatedLocations,
      };
      this.userProfileSubject.next(updatedProfile);

      return true;
    } catch (error) {
      console.error('Error setting default location:', error);
      return false;
    }
  }

  /**
   * Get user's saved locations
   */
  getUserLocations(): UserLocation[] {
    return this.getCurrentUserProfile()?.savedLocations || [];
  }

  /**
   * Get user's default location
   */
  getDefaultLocation(): UserLocation | null {
    const locations = this.getUserLocations();
    return locations.find((location) => location.isDefault) || null;
  }

  /**
   * Update user profile data
   */
  async updateUserProfile(updates: Partial<UserProfile>): Promise<boolean> {
    try {
      const currentUser = this.getCurrentUser();
      const currentProfile = this.getCurrentUserProfile();

      if (!currentUser || !currentProfile) {
        throw new Error('User not authenticated');
      }

      const userDocRef = doc(this.firestore, 'users', currentUser.uid);
      await updateDoc(userDocRef, {
        ...updates,
        updatedAt: new Date(),
      });

      // Update local profile
      const updatedProfile = {
        ...currentProfile,
        ...updates,
        updatedAt: new Date(),
      };
      this.userProfileSubject.next(updatedProfile);

      return true;
    } catch (error) {
      console.error('Error updating user profile:', error);
      return false;
    }
  }

  // Session Management Methods

  /**
   * Save user session to localStorage
   */
  private saveUserSession(user: User, profile: UserProfile): void {
    try {
      const session: UserSession = {
        user: {
          uid: user.uid,
          email: user.email,
          emailVerified: user.emailVerified,
          displayName: user.displayName,
          photoURL: user.photoURL,
        } as User,
        profile,
        loginTimestamp: Date.now(),
        lastActivity: Date.now(),
      };

      localStorage.setItem(this.USER_SESSION_KEY, JSON.stringify(session));
      console.log('User session saved to localStorage');
    } catch (error) {
      console.error('Error saving user session:', error);
    }
  }

  /**
   * Restore user session from localStorage
   */
  private async restoreUserSession(): Promise<void> {
    try {
      const storedSession = localStorage.getItem(this.USER_SESSION_KEY);
      if (!storedSession) {
        return;
      }

      const session: UserSession = JSON.parse(storedSession);

      // Check if session is expired (24 hours)
      const isExpired =
        Date.now() - session.loginTimestamp >
        this.SESSION_EXPIRY_HOURS * 60 * 60 * 1000;

      if (isExpired) {
        console.log('User session expired, clearing...');
        this.clearUserSession();
        return;
      }

      // Check if there's been no activity for too long (8 hours)
      const inactivityLimit = 8 * 60 * 60 * 1000; // 8 hours
      const isInactive = Date.now() - session.lastActivity > inactivityLimit;

      if (isInactive) {
        console.log('User session inactive for too long, clearing...');
        this.clearUserSession();
        return;
      }

      // Restore user state
      console.log('Restoring user session from localStorage');
      this.currentUserSubject.next(session.user);
      this.userProfileSubject.next(session.profile);
      this.navigationState.setUserRole(session.profile.role);

      // Update last activity
      this.updateLastActivity();
    } catch (error) {
      console.error('Error restoring user session:', error);
      this.clearUserSession();
    }
  }

  /**
   * Update last activity timestamp
   */
  private updateLastActivity(): void {
    try {
      const storedSession = localStorage.getItem(this.USER_SESSION_KEY);
      if (storedSession) {
        const session: UserSession = JSON.parse(storedSession);
        session.lastActivity = Date.now();
        localStorage.setItem(this.USER_SESSION_KEY, JSON.stringify(session));
      }
    } catch (error) {
      console.error('Error updating last activity:', error);
    }
  }

  /**
   * Public method to update user activity (called by ActivityTrackerService)
   */
  updateUserActivity(): void {
    this.updateLastActivity();
  }

  /**
   * Clear user session from localStorage
   */
  private clearUserSession(): void {
    try {
      localStorage.removeItem(this.USER_SESSION_KEY);
      this.navigationState.clearNavigationState();
      console.log('User session cleared from localStorage');
    } catch (error) {
      console.error('Error clearing user session:', error);
    }
  }

  /**
   * Get stored user session
   */
  getStoredSession(): UserSession | null {
    try {
      const storedSession = localStorage.getItem(this.USER_SESSION_KEY);
      return storedSession ? JSON.parse(storedSession) : null;
    } catch (error) {
      console.error('Error getting stored session:', error);
      return null;
    }
  }

  /**
   * Check if user should be automatically logged in
   */
  shouldAutoLogin(): boolean {
    const session = this.getStoredSession();
    if (!session) {
      return false;
    }

    const isExpired =
      Date.now() - session.loginTimestamp >
      this.SESSION_EXPIRY_HOURS * 60 * 60 * 1000;
    const inactivityLimit = 8 * 60 * 60 * 1000; // 8 hours
    const isInactive = Date.now() - session.lastActivity > inactivityLimit;

    return !isExpired && !isInactive;
  }

  /**
   * Navigate to appropriate page based on stored session and navigation state
   */
  async navigateToAppropriateStartPage(): Promise<void> {
    try {
      await this.waitForAuthInitialization();

      const currentUser = this.getCurrentUser();
      const currentProfile = this.getCurrentUserProfile();

      if (!currentUser || !currentProfile) {
        // No valid session, go to login
        this.router.navigate(['/pages/auth/login']);
        return;
      }

      console.log(
        'Navigating to appropriate start page for role:',
        currentProfile.role
      );

      // For app startup with valid session, try last visited route first
      const navigatedToLast = this.navigationState.navigateToLastVisited();

      if (!navigatedToLast) {
        // Fallback to role-based default dashboard
        await this.redirectBasedOnRole(currentProfile.role);
      }
    } catch (error) {
      console.error('Error navigating to appropriate start page:', error);
      this.router.navigate(['/pages/auth/login']);
    }
  }
}
