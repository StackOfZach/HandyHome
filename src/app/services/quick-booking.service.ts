import { Injectable } from '@angular/core';
import {
  Firestore,
  collection,
  query,
  where,
  getDocs,
  doc,
  addDoc,
  updateDoc,
  getDoc,
  onSnapshot,
  orderBy,
  limit,
  Timestamp,
} from '@angular/fire/firestore';
import { Observable, from } from 'rxjs';
import { map } from 'rxjs/operators';

export interface ServiceCategory {
  id: string;
  name: string;
  icon: string;
  color: string;
  description: string;
  averagePrice: number;
  serviceChargeRate: number;
  estimatedDuration: number;
  services: string[];
  isActive: boolean;
  createdAt: any;
}

export interface Worker {
  id: string;
  fullName: string;
  email: string;
  phoneNumber: string;
  skills: string[];
  availability: 'online' | 'offline' | 'busy';
  verificationStatus: 'pending' | 'verified' | 'rejected';
  rating: number;
  totalJobs: number;
  location?: {
    latitude: number;
    longitude: number;
    address: string;
  };
  profilePicture?: string;
  isActive: boolean;
  createdAt: any;
}

export interface BookingData {
  id?: string;
  clientId: string;
  categoryId: string;
  categoryName: string;
  subService: string;
  location: {
    lat: number;
    lng: number;
    address: string;
    city?: string;
    province?: string;
  };
  pricing: {
    basePrice: number;
    serviceCharge: number;
    total: number;
  };
  estimatedDuration: number;
  status:
    | 'searching'
    | 'accepted'
    | 'on-the-way'
    | 'in-progress'
    | 'completed'
    | 'cancelled';
  assignedWorker: string | null;
  createdAt: Timestamp;
  scheduledDate?: Timestamp;
  scheduledTime?: string;
}

export interface WorkerNotification {
  id?: string;
  title: string;
  message: string;
  bookingId: string;
  createdAt: Timestamp;
  read: boolean;
  type: 'booking_request' | 'booking_update' | 'payment' | 'rating';
  data?: any;
}

export interface ClientNotification {
  id?: string;
  title: string;
  message: string;
  bookingId?: string;
  createdAt: Timestamp;
  read: boolean;
  type: 'worker_found' | 'booking_update' | 'payment' | 'promotion';
  data?: any;
}

@Injectable({
  providedIn: 'root',
})
export class QuickBookingService {
  constructor(private firestore: Firestore) {}

  // Get all active service categories
  getServiceCategories(): Observable<ServiceCategory[]> {
    const categoriesRef = collection(this.firestore, 'serviceCategories');
    const q = query(
      categoriesRef,
      where('isActive', '==', true),
      orderBy('name', 'asc')
    );

    return from(getDocs(q)).pipe(
      map((querySnapshot) => {
        const categories: ServiceCategory[] = [];
        querySnapshot.forEach((doc) => {
          const data = doc.data() as Omit<ServiceCategory, 'id'>;
          categories.push({
            id: doc.id,
            ...data,
          });
        });
        return categories;
      })
    );
  }

  // Get a specific service category by ID
  async getServiceCategoryById(
    categoryId: string
  ): Promise<ServiceCategory | null> {
    try {
      const categoryRef = doc(this.firestore, 'serviceCategories', categoryId);
      const categoryDoc = await getDoc(categoryRef);

      if (categoryDoc.exists()) {
        const data = categoryDoc.data() as Omit<ServiceCategory, 'id'>;
        return {
          id: categoryDoc.id,
          ...data,
        };
      }
      return null;
    } catch (error) {
      console.error('Error getting service category:', error);
      return null;
    }
  }

  // Create a new quick booking
  async createBooking(
    bookingData: Omit<BookingData, 'id'>
  ): Promise<string | null> {
    try {
      const quickBookingsRef = collection(this.firestore, 'quickbookings');
      const docRef = await addDoc(quickBookingsRef, bookingData);
      return docRef.id;
    } catch (error) {
      console.error('Error creating quick booking:', error);
      return null;
    }
  }

  // Find matching workers for a booking
  async findMatchingWorkers(
    categoryId: string,
    subService: string,
    location: { lat: number; lng: number }
  ): Promise<Worker[]> {
    try {
      const workersRef = collection(this.firestore, 'workers');

      // Query workers with matching skills, availability, and verification
      const q = query(
        workersRef,
        where('skills', 'array-contains-any', [categoryId, subService]),
        where('availability', '==', 'online'),
        where('verificationStatus', '==', 'verified'),
        where('isActive', '==', true),
        orderBy('rating', 'desc'),
        limit(20) // Limit to top 20 workers
      );

      const querySnapshot = await getDocs(q);
      const matchingWorkers: Worker[] = [];

      querySnapshot.forEach((doc) => {
        const data = doc.data() as Omit<Worker, 'id'>;
        matchingWorkers.push({
          id: doc.id,
          ...data,
        });
      });

      // TODO: Add distance-based filtering if worker locations are available
      // For now, return all matching workers
      return matchingWorkers;
    } catch (error) {
      console.error('Error finding matching workers:', error);
      return [];
    }
  }

  // Notify workers about a new booking opportunity
  async notifyMatchingWorkers(
    bookingId: string,
    categoryName: string,
    subService: string,
    matchingWorkers: Worker[]
  ): Promise<number> {
    try {
      const notificationPromises: Promise<any>[] = [];
      let notifiedCount = 0;

      for (const worker of matchingWorkers) {
        const notificationData: Omit<WorkerNotification, 'id'> = {
          title: `New ${categoryName} Job Nearby`,
          message: `Client requested ${subService} service near your area. Tap to view details and accept.`,
          bookingId,
          createdAt: Timestamp.now(),
          read: false,
          type: 'booking_request',
          data: {
            categoryName,
            subService,
            bookingId,
          },
        };

        const notificationRef = collection(
          this.firestore,
          `workers/${worker.id}/notifications`
        );
        notificationPromises.push(addDoc(notificationRef, notificationData));
        notifiedCount++;
      }

      await Promise.all(notificationPromises);
      console.log(
        `Successfully notified ${notifiedCount} workers about booking ${bookingId}`
      );
      return notifiedCount;
    } catch (error) {
      console.error('Error notifying workers:', error);
      return 0;
    }
  }

  // Update quick booking when worker accepts
  async acceptBooking(
    bookingId: string,
    workerId: string,
    workerName: string
  ): Promise<boolean> {
    try {
      const quickBookingRef = doc(this.firestore, 'quickbookings', bookingId);
      await updateDoc(quickBookingRef, {
        assignedWorker: workerId,
        status: 'accepted',
        acceptedAt: Timestamp.now(),
      });

      // Get booking details to notify client
      const bookingDoc = await getDoc(quickBookingRef);
      if (bookingDoc.exists()) {
        const bookingData = bookingDoc.data() as BookingData;
        await this.notifyClient(
          bookingData.clientId,
          bookingId,
          workerName,
          bookingData.categoryName
        );
      }

      return true;
    } catch (error) {
      console.error('Error accepting quick booking:', error);
      return false;
    }
  }

  // Notify client when worker is found
  async notifyClient(
    clientId: string,
    bookingId: string,
    workerName: string,
    categoryName: string
  ): Promise<void> {
    try {
      const clientNotificationData: Omit<ClientNotification, 'id'> = {
        title: 'Worker Found!',
        message: `Your ${categoryName} booking was accepted by ${workerName}. You can now track their location and contact them.`,
        bookingId,
        createdAt: Timestamp.now(),
        read: false,
        type: 'worker_found',
        data: {
          workerName,
          categoryName,
          bookingId,
        },
      };

      const notificationRef = collection(
        this.firestore,
        `users/${clientId}/notifications`
      );
      await addDoc(notificationRef, clientNotificationData);

      console.log(
        `Successfully notified client ${clientId} about worker assignment`
      );
    } catch (error) {
      console.error('Error notifying client:', error);
    }
  }

  // Get worker details by ID
  async getWorkerById(workerId: string): Promise<Worker | null> {
    try {
      const workerRef = doc(this.firestore, 'workers', workerId);
      const workerDoc = await getDoc(workerRef);

      if (workerDoc.exists()) {
        const data = workerDoc.data() as Omit<Worker, 'id'>;
        return {
          id: workerDoc.id,
          ...data,
        };
      }
      return null;
    } catch (error) {
      console.error('Error getting worker:', error);
      return null;
    }
  }

  // Get quick booking by ID
  async getQuickBookingById(bookingId: string): Promise<BookingData | null> {
    try {
      const quickBookingRef = doc(this.firestore, 'quickbookings', bookingId);
      const bookingDoc = await getDoc(quickBookingRef);

      if (bookingDoc.exists()) {
        return { id: bookingDoc.id, ...bookingDoc.data() } as BookingData;
      }
      return null;
    } catch (error) {
      console.error('Error getting quick booking:', error);
      return null;
    }
  }

  // Update quick booking status
  async updateQuickBookingStatus(
    bookingId: string,
    status: string,
    additionalData?: any
  ): Promise<boolean> {
    try {
      const quickBookingRef = doc(this.firestore, 'quickbookings', bookingId);
      await updateDoc(quickBookingRef, {
        status,
        updatedAt: Timestamp.now(),
        ...additionalData,
      });
      return true;
    } catch (error) {
      console.error('Error updating quick booking status:', error);
      return false;
    }
  }

  // Calculate distance between two coordinates (Haversine formula)
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
    const d = R * c; // Distance in kilometers
    return d;
  }

  private deg2rad(deg: number): number {
    return deg * (Math.PI / 180);
  }

  // Filter workers by distance (if location data is available)
  filterWorkersByDistance(
    workers: Worker[],
    clientLocation: { lat: number; lng: number },
    maxDistance: number = 10
  ): Worker[] {
    return workers.filter((worker) => {
      if (!worker.location) return true; // Include workers without location data

      const distance = this.calculateDistance(
        clientLocation.lat,
        clientLocation.lng,
        worker.location.latitude,
        worker.location.longitude
      );

      return distance <= maxDistance;
    });
  }

  // ===============================================================
  // 🚀 Auto-redirect functionality for client when worker accepts
  // ===============================================================

  /**
   * Monitor booking status changes and return observable for auto-redirect
   * @param bookingId - The booking ID to monitor
   * @returns Observable that emits when status changes to 'accepted'
   */
  monitorBookingStatus(bookingId: string): Observable<BookingData | null> {
    const quickBookingRef = doc(this.firestore, 'quickbookings', bookingId);

    return new Observable((observer) => {
      const unsubscribe = onSnapshot(
        quickBookingRef,
        (doc: any) => {
          if (doc.exists()) {
            const data = doc.data() as BookingData;
            const booking = { id: doc.id, ...data };
            observer.next(booking);
          } else {
            observer.next(null);
          }
        },
        (error: any) => {
          console.error('Error monitoring booking status:', error);
          observer.error(error);
        }
      );

      // Return cleanup function
      return () => unsubscribe();
    });
  }

  /**
   * Monitor regular booking status changes (for non-quick bookings)
   * @param bookingId - The booking ID to monitor
   * @returns Observable that emits when status changes
   */
  monitorRegularBookingStatus(bookingId: string): Observable<any> {
    const bookingRef = doc(this.firestore, 'bookings', bookingId);

    return new Observable((observer) => {
      const unsubscribe = onSnapshot(
        bookingRef,
        (doc: any) => {
          if (doc.exists()) {
            const data = doc.data();
            const booking = { id: doc.id, ...data };
            observer.next(booking);
          } else {
            observer.next(null);
          }
        },
        (error: any) => {
          console.error('Error monitoring regular booking status:', error);
          observer.error(error);
        }
      );

      return () => unsubscribe();
    });
  }

  // Complete booking flow - create booking and notify workers
  async initiateQuickBooking(
    clientId: string,
    categoryId: string,
    subService: string,
    location: {
      lat: number;
      lng: number;
      address: string;
      city?: string;
      province?: string;
    },
    pricing: { basePrice: number; serviceCharge: number; total: number },
    estimatedDuration: number
  ): Promise<{
    success: boolean;
    bookingId?: string;
    workersNotified?: number;
    error?: string;
  }> {
    try {
      // Get category details
      const category = await this.getServiceCategoryById(categoryId);
      if (!category) {
        return { success: false, error: 'Category not found' };
      }

      // Create booking
      const bookingData: Omit<BookingData, 'id'> = {
        clientId,
        categoryId,
        categoryName: category.name,
        subService,
        location,
        pricing,
        estimatedDuration,
        status: 'searching',
        assignedWorker: null,
        createdAt: Timestamp.now(),
      };

      const bookingId = await this.createBooking(bookingData);
      if (!bookingId) {
        return { success: false, error: 'Failed to create booking' };
      }

      // Find matching workers
      const matchingWorkers = await this.findMatchingWorkers(
        categoryId,
        subService,
        location
      );

      // Notify workers
      const workersNotified = await this.notifyMatchingWorkers(
        bookingId,
        category.name,
        subService,
        matchingWorkers
      );

      return {
        success: true,
        bookingId,
        workersNotified,
      };
    } catch (error) {
      console.error('Error initiating quick booking:', error);
      return { success: false, error: 'An unexpected error occurred' };
    }
  }
}
