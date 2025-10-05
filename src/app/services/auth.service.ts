import { Injectable } from '@angular/core';
import {
  Auth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  User,
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
  createdAt: Date;
}

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private currentUserSubject = new BehaviorSubject<User | null>(null);
  public currentUser$ = this.currentUserSubject.asObservable();

  private userProfileSubject = new BehaviorSubject<UserProfile | null>(null);
  public userProfile$ = this.userProfileSubject.asObservable();

  constructor(
    private auth: Auth,
    private firestore: Firestore,
    private router: Router
  ) {
    // Listen to auth state changes
    this.auth.onAuthStateChanged(async (user) => {
      this.currentUserSubject.next(user);
      if (user) {
        const profile = await this.getUserProfile(user.uid);
        this.userProfileSubject.next(profile);
      } else {
        this.userProfileSubject.next(null);
      }
    });
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

      await setDoc(doc(this.firestore, 'users', user.uid), userProfile);
      this.userProfileSubject.next(userProfile);

      // Redirect based on role
      await this.redirectBasedOnRole(role);
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
      const userCredential = await signInWithEmailAndPassword(
        this.auth,
        email,
        password
      );
      const user = userCredential.user;

      // Get user profile and redirect
      const profile = await this.getUserProfile(user.uid);
      if (profile) {
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
      await signOut(this.auth);
      this.currentUserSubject.next(null);
      this.userProfileSubject.next(null);
      this.router.navigate(['/pages/auth/login']);
    } catch (error) {
      console.error('Logout error:', error);
      throw error;
    }
  }

  /**
   * Get user profile from Firestore
   */
  async getUserProfile(uid: string): Promise<UserProfile | null> {
    try {
      const userDoc = await getDoc(doc(this.firestore, 'users', uid));
      if (userDoc.exists()) {
        const data = userDoc.data() as DocumentData;
        return {
          ...data,
          createdAt: data['createdAt']?.toDate() || new Date(),
        } as UserProfile;
      }
      return null;
    } catch (error) {
      console.error('Get user profile error:', error);
      return null;
    }
  }

  /**
   * Check if user is authenticated
   */
  isAuthenticated(): boolean {
    return this.currentUserSubject.value !== null;
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
    switch (role) {
      case 'client':
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
            this.router.navigate(['/pages/worker/interview']);
          } else if (!isVerified) {
            // Show pending verification message and stay on login
            this.router.navigate(['/pages/auth/login']);
            // Could show a toast message here about pending verification
          } else {
            // Worker is verified, go to dashboard
            this.router.navigate(['/pages/worker/dashboard']);
          }
        } else {
          this.router.navigate(['/pages/auth/login']);
        }
        break;
      case 'admin':
        this.router.navigate(['/pages/admin/dashboard']);
        break;
      default:
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
}
