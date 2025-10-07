import { Injectable } from '@angular/core';
import {
  Firestore,
  doc,
  updateDoc,
  serverTimestamp,
  GeoPoint,
} from '@angular/fire/firestore';
import { BehaviorSubject, Observable } from 'rxjs';

export interface LocationData {
  latitude: number;
  longitude: number;
  accuracy?: number;
  timestamp: Date;
}

export interface LocationTrackingStatus {
  isTracking: boolean;
  isPermissionGranted: boolean;
  lastUpdate?: Date;
  error?: string;
}

@Injectable({
  providedIn: 'root',
})
export class LocationTrackingService {
  private trackingInterval?: number;
  private watchId?: number;
  private readonly TRACKING_INTERVAL = 30000; // 30 seconds

  private trackingStatus$ = new BehaviorSubject<LocationTrackingStatus>({
    isTracking: false,
    isPermissionGranted: false,
  });

  private currentLocation$ = new BehaviorSubject<LocationData | null>(null);

  constructor(private firestore: Firestore) {}

  /**
   * Get tracking status as observable
   */
  getTrackingStatus(): Observable<LocationTrackingStatus> {
    return this.trackingStatus$.asObservable();
  }

  /**
   * Get current location as observable
   */
  getCurrentLocation(): Observable<LocationData | null> {
    return this.currentLocation$.asObservable();
  }

  /**
   * Start location tracking for a worker
   */
  async startTracking(workerId: string): Promise<void> {
    try {
      // Check if geolocation is supported
      if (!navigator.geolocation) {
        throw new Error('Geolocation is not supported by this browser');
      }

      // Request permission
      const permission = await this.requestLocationPermission();
      if (!permission) {
        throw new Error('Location permission denied');
      }

      // Update status
      this.updateTrackingStatus({
        isTracking: true,
        isPermissionGranted: true,
        error: undefined,
      });

      // Start watching position
      this.startPositionWatch(workerId);

      console.log('Location tracking started for worker:', workerId);
    } catch (error) {
      console.error('Error starting location tracking:', error);
      this.updateTrackingStatus({
        isTracking: false,
        isPermissionGranted: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Stop location tracking
   */
  stopTracking(): void {
    // Clear interval
    if (this.trackingInterval) {
      clearInterval(this.trackingInterval);
      this.trackingInterval = undefined;
    }

    // Clear watch
    if (this.watchId) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = undefined;
    }

    // Update status
    this.updateTrackingStatus({
      isTracking: false,
      isPermissionGranted: this.trackingStatus$.value.isPermissionGranted,
      error: undefined,
    });

    console.log('Location tracking stopped');
  }

  /**
   * Request location permission
   */
  private async requestLocationPermission(): Promise<boolean> {
    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        () => resolve(true),
        (error) => {
          console.error('Location permission error:', error);
          resolve(false);
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0,
        }
      );
    });
  }

  /**
   * Start watching position and update database periodically
   */
  private startPositionWatch(workerId: string): void {
    // Set up interval to update location every 30 seconds
    this.trackingInterval = window.setInterval(() => {
      this.getCurrentPosition(workerId);
    }, this.TRACKING_INTERVAL);

    // Get initial position
    this.getCurrentPosition(workerId);
  }

  /**
   * Get current position and update database
   */
  private getCurrentPosition(workerId: string): void {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const locationData: LocationData = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          timestamp: new Date(),
        };

        // Update local state
        this.currentLocation$.next(locationData);

        // Update database
        this.updateWorkerLocation(workerId, locationData);

        // Update tracking status
        this.updateTrackingStatus({
          isTracking: true,
          isPermissionGranted: true,
          lastUpdate: locationData.timestamp,
          error: undefined,
        });
      },
      (error) => {
        console.error('Error getting location:', error);
        let errorMessage = 'Unknown location error';

        switch (error.code) {
          case error.PERMISSION_DENIED:
            errorMessage = 'Location access denied by user';
            break;
          case error.POSITION_UNAVAILABLE:
            errorMessage = 'Location information unavailable';
            break;
          case error.TIMEOUT:
            errorMessage = 'Location request timed out';
            break;
        }

        this.updateTrackingStatus({
          isTracking: false,
          isPermissionGranted: false,
          error: errorMessage,
        });
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 5000,
      }
    );
  }

  /**
   * Update worker location in Firestore
   */
  private async updateWorkerLocation(
    workerId: string,
    location: LocationData
  ): Promise<void> {
    try {
      const workerRef = doc(this.firestore, `workers/${workerId}`);

      await updateDoc(workerRef, {
        currentLocation: new GeoPoint(location.latitude, location.longitude),
        locationAccuracy: location.accuracy || 0,
        lastLocationUpdate: serverTimestamp(),
        locationTrackingEnabled: true,
      });

      console.log('Worker location updated:', {
        workerId,
        lat: location.latitude,
        lng: location.longitude,
        accuracy: location.accuracy,
      });
    } catch (error) {
      console.error('Error updating worker location:', error);
      this.updateTrackingStatus({
        isTracking: this.trackingStatus$.value.isTracking,
        isPermissionGranted: this.trackingStatus$.value.isPermissionGranted,
        lastUpdate: this.trackingStatus$.value.lastUpdate,
        error: 'Failed to update location in database',
      });
    }
  }

  /**
   * Update tracking status
   */
  private updateTrackingStatus(status: Partial<LocationTrackingStatus>): void {
    const currentStatus = this.trackingStatus$.value;
    this.trackingStatus$.next({
      ...currentStatus,
      ...status,
    });
  }

  /**
   * Get single location update
   */
  async getSingleLocation(): Promise<LocationData> {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('Geolocation not supported'));
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (position) => {
          resolve({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
            timestamp: new Date(),
          });
        },
        (error) => {
          reject(error);
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0,
        }
      );
    });
  }

  /**
   * Disable location tracking for worker (update database only)
   */
  async disableLocationTracking(workerId: string): Promise<void> {
    try {
      const workerRef = doc(this.firestore, `workers/${workerId}`);

      await updateDoc(workerRef, {
        locationTrackingEnabled: false,
        lastLocationUpdate: serverTimestamp(),
      });

      console.log('Location tracking disabled for worker:', workerId);
    } catch (error) {
      console.error('Error disabling location tracking:', error);
      throw error;
    }
  }
}
