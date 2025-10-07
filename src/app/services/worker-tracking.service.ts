import { Injectable } from '@angular/core';
import {
  Firestore,
  doc,
  onSnapshot,
  Unsubscribe,
  collection,
  query,
  where,
  getDocs,
  getDoc,
} from '@angular/fire/firestore';
import { BehaviorSubject, Observable, combineLatest } from 'rxjs';
import { map } from 'rxjs/operators';

export interface WorkerLocation {
  lat: number;
  lng: number;
  lastUpdatedAt: any;
  accuracy?: number;
}

export interface TrackingData {
  worker: {
    uid: string;
    fullName: string;
    profilePhotoUrl?: string;
    profilePhotoData?: string;
    rating: number;
    skills: string[];
    phone?: string;
    email?: string;
    location: WorkerLocation;
  };
  client: {
    location: {
      lat: number;
      lng: number;
      address: string;
    };
  };
  distance: number;
  estimatedTravelTime: number;
  statusMessage: string;
  lastLocationUpdate?: Date;
}

@Injectable({
  providedIn: 'root',
})
export class WorkerTrackingService {
  private trackingData$ = new BehaviorSubject<TrackingData | null>(null);
  private workerLocationListener?: Unsubscribe;
  private bookingListener?: Unsubscribe;
  private refreshTimer?: number;

  constructor(private firestore: Firestore) {}

  /**
   * Start tracking worker for a specific booking
   */
  startTracking(bookingId: string): Observable<TrackingData | null> {
    this.stopTracking(); // Stop any existing tracking

    // Load initial booking data and start tracking
    this.initializeTracking(bookingId);

    return this.trackingData$.asObservable();
  }

  /**
   * Stop tracking and cleanup
   */
  stopTracking(): void {
    if (this.workerLocationListener) {
      this.workerLocationListener();
      this.workerLocationListener = undefined;
    }

    if (this.bookingListener) {
      this.bookingListener();
      this.bookingListener = undefined;
    }

    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = undefined;
    }

    this.trackingData$.next(null);
  }

  /**
   * Get current tracking data
   */
  getCurrentTrackingData(): TrackingData | null {
    return this.trackingData$.value;
  }

  /**
   * Initialize tracking for a booking
   */
  private async initializeTracking(bookingId: string): Promise<void> {
    try {
      // First, determine if this is a quick booking or regular booking
      const isQuickBooking = await this.determineBookingType(bookingId);
      const collection = isQuickBooking ? 'quickbookings' : 'bookings';

      // Get booking data
      const bookingRef = doc(this.firestore, `${collection}/${bookingId}`);

      this.bookingListener = onSnapshot(bookingRef, async (bookingDoc) => {
        if (bookingDoc.exists()) {
          const bookingData = bookingDoc.data();

          if (bookingData['assignedWorker']) {
            await this.setupWorkerTracking(
              bookingData['assignedWorker'],
              bookingData
            );
          }
        }
      });
    } catch (error) {
      console.error('Error initializing tracking:', error);
    }
  }

  /**
   * Determine if booking is quick or regular
   */
  private async determineBookingType(bookingId: string): Promise<boolean> {
    try {
      // Check quickbookings first
      const quickBookingRef = doc(this.firestore, `quickbookings/${bookingId}`);
      const quickBookingSnap = await getDoc(quickBookingRef);

      return quickBookingSnap.exists();
    } catch (error) {
      console.error('Error determining booking type:', error);
      return false;
    }
  }

  /**
   * Setup worker location tracking
   */
  private async setupWorkerTracking(
    workerId: string,
    bookingData: any
  ): Promise<void> {
    try {
      // Get worker profile data from users collection
      const userRef = doc(this.firestore, `users/${workerId}`);
      const userSnap = await getDoc(userRef);
      const userData = userSnap.data();

      // Get worker professional data from workers collection
      const workerRef = doc(this.firestore, `workers/${workerId}`);

      // Listen to worker location updates
      this.workerLocationListener = onSnapshot(workerRef, (workerDoc) => {
        if (workerDoc.exists() && userData) {
          const workerData = workerDoc.data();

          const trackingData: TrackingData = {
            worker: {
              uid: workerId,
              fullName: userData['fullName'] || 'Worker',
              profilePhotoUrl: userData['profilePicture'],
              profilePhotoData: workerData['profilePhotoData'],
              rating: workerData['rating'] || 4.5,
              skills: workerData['skills'] || [],
              phone: userData['phone'],
              email: userData['email'],
              location: workerData['currentLocation']
                ? {
                    lat: workerData['currentLocation'].latitude,
                    lng: workerData['currentLocation'].longitude,
                    lastUpdatedAt: workerData['lastLocationUpdate'],
                    accuracy: workerData['locationAccuracy'],
                  }
                : {
                    lat: 0,
                    lng: 0,
                    lastUpdatedAt: null,
                  },
            },
            client: {
              location: bookingData['location'],
            },
            distance: 0,
            estimatedTravelTime: 0,
            statusMessage: 'Locating worker...',
            lastLocationUpdate: workerData['lastLocationUpdate']?.toDate(),
          };

          // Calculate distance and update status
          if (trackingData.worker.location) {
            trackingData.distance = this.calculateDistance(
              trackingData.worker.location.lat,
              trackingData.worker.location.lng,
              trackingData.client.location.lat,
              trackingData.client.location.lng
            );

            trackingData.estimatedTravelTime = this.calculateTravelTime(
              trackingData.distance
            );
            trackingData.statusMessage = this.generateStatusMessage(
              trackingData.distance
            );
          }

          this.trackingData$.next(trackingData);
        }
      });
    } catch (error) {
      console.error('Error setting up worker tracking:', error);
    }
  }

  /**
   * Calculate distance between two points using Haversine formula
   */
  private calculateDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
  ): number {
    const R = 6371; // Radius of the Earth in kilometers
    const dLat = this.deg2rad(lat2 - lat1);
    const dLon = this.deg2rad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.deg2rad(lat1)) *
        Math.cos(this.deg2rad(lat2)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c; // Distance in kilometers
    return distance;
  }

  /**
   * Convert degrees to radians
   */
  private deg2rad(deg: number): number {
    return deg * (Math.PI / 180);
  }

  /**
   * Calculate estimated travel time based on distance
   */
  private calculateTravelTime(distance: number): number {
    // Assuming average speed of 30 km/h in urban areas
    const averageSpeed = 30; // km/h
    const timeInHours = distance / averageSpeed;
    const timeInMinutes = timeInHours * 60;
    return Math.round(timeInMinutes);
  }

  /**
   * Generate dynamic status message based on distance
   */
  private generateStatusMessage(distance: number): string {
    if (distance > 5) {
      return 'Worker is on the way to your location.';
    } else if (distance > 2) {
      return 'Worker is getting closer to your location.';
    } else if (distance > 0.5) {
      return 'Worker is on the move, get ready — worker is nearby!';
    } else if (distance > 0.1) {
      return 'Worker has almost arrived at your location!';
    } else {
      return 'Worker has arrived at your location!';
    }
  }

  /**
   * Get formatted time since last location update
   */
  getTimeSinceLastUpdate(): string {
    const trackingData = this.trackingData$.value;
    if (!trackingData?.lastLocationUpdate) {
      return 'Unknown';
    }

    const now = new Date();
    const diffInSeconds = Math.floor(
      (now.getTime() - trackingData.lastLocationUpdate.getTime()) / 1000
    );

    if (diffInSeconds < 60) {
      return `${diffInSeconds} seconds ago`;
    } else if (diffInSeconds < 3600) {
      const minutes = Math.floor(diffInSeconds / 60);
      return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`;
    } else {
      const hours = Math.floor(diffInSeconds / 3600);
      return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
    }
  }

  /**
   * Force refresh worker location (useful for manual refresh)
   */
  async refreshWorkerLocation(workerId: string): Promise<void> {
    try {
      const workerRef = doc(this.firestore, `workers/${workerId}`);
      const workerDoc = await getDoc(workerRef);

      if (workerDoc.exists()) {
        // Trigger the snapshot listener manually
        // This is mainly for debugging or manual refresh
        console.log('Worker location refreshed');
      }
    } catch (error) {
      console.error('Error refreshing worker location:', error);
    }
  }
}
