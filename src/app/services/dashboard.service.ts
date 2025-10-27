import { Injectable } from '@angular/core';
import {
  Firestore,
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  DocumentData,
  QuerySnapshot,
  Timestamp,
} from '@angular/fire/firestore';
import { BehaviorSubject, Observable } from 'rxjs';
import { UserProfile } from './auth.service';

export interface BookingDetails {
  id: string;
  clientId: string;
  workerId: string;
  workerName: string;
  workerAvatar?: string;
  workerPhone?: string;
  serviceType: string;
  serviceCategory: string;
  status:
    | 'pending'
    | 'accepted'
    | 'on-the-way'
    | 'in-progress'
    | 'completed'
    | 'cancelled';
  scheduledDate: Date;
  scheduledTime: string;
  address: string;
  coordinates?: {
    latitude: number;
    longitude: number;
  };
  description: string;
  price: number;
  estimatedDuration: number; // in minutes
  workerLocation?: {
    latitude: number;
    longitude: number;
    lastUpdated: Date;
  };
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
  cancelledAt?: Date;
  cancellationReason?: string;
  rating?: number;
  review?: string;
}

export interface WorkerProfile {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  avatar?: string;
  bio?: string;
  rating: number;
  totalRatings: number;
  services: string[];
  serviceCategories: string[];
  totalJobs: number;
  completedJobs: number;
  isOnline: boolean;
  isVerified: boolean;
  joinedDate: Date;
  location?: {
    latitude: number;
    longitude: number;
    address: string;
    lastUpdated: Date;
  };
  availability: {
    monday: { start: string; end: string; available: boolean };
    tuesday: { start: string; end: string; available: boolean };
    wednesday: { start: string; end: string; available: boolean };
    thursday: { start: string; end: string; available: boolean };
    friday: { start: string; end: string; available: boolean };
    saturday: { start: string; end: string; available: boolean };
    sunday: { start: string; end: string; available: boolean };
  };
  priceRange: {
    min: number;
    max: number;
    currency: string;
  };
}

export interface ServiceCategory {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  isActive: boolean;
  services: string[];
  servicesPricing?: string[]; // Unit pricing for each sub-service ('per_hour' or 'per_day')
  servicesQuickBookingPricing?: number[]; // Quick booking pricing for each sub-service
  servicesQuickBookingUnit?: string[]; // Unit pricing for quick booking ('per_hour' or 'per_day')
  requirements?: string[];
  requiresCertificate?: boolean; // Whether this service requires certificate upload during worker interview
  averagePrice?: number; // Optional - can be set by system defaults
  estimatedDuration?: number; // Optional - can be set by system defaults
}

export interface NotificationData {
  id: string;
  userId: string;
  title: string;
  message: string;
  type:
    | 'booking'
    | 'promotion'
    | 'reminder'
    | 'system'
    | 'worker_update'
    | 'worker_found'
    | 'booking_update';
  priority: 'low' | 'medium' | 'high';
  isRead: boolean;
  actionUrl?: string;
  actionText?: string;
  metadata?: {
    bookingId?: string;
    workerId?: string;
    promoCode?: string;
    bookingType?: string;
  };
  createdAt: Date | Timestamp;
  readAt?: Date | Timestamp;
  expiresAt?: Date | Timestamp;
}

@Injectable({
  providedIn: 'root',
})
export class DashboardService {
  private bookingsSubject = new BehaviorSubject<BookingDetails[]>([]);
  public bookings$ = this.bookingsSubject.asObservable();

  private workersSubject = new BehaviorSubject<WorkerProfile[]>([]);
  public workers$ = this.workersSubject.asObservable();

  private notificationsSubject = new BehaviorSubject<NotificationData[]>([]);
  public notifications$ = this.notificationsSubject.asObservable();

  constructor(private firestore: Firestore) {}

  /**
   * Load user's active and upcoming bookings
   */
  loadActiveBookings(userId: string): Observable<BookingDetails[]> {
    const bookingsRef = collection(this.firestore, 'bookings');
    const q = query(
      bookingsRef,
      where('clientId', '==', userId),
      where('status', 'in', [
        'pending',
        'accepted',
        'on-the-way',
        'in-progress',
      ]),
      orderBy('scheduledDate', 'asc')
    );

    return new Observable((observer) => {
      const unsubscribe = onSnapshot(
        q,
        (querySnapshot) => {
          const bookings: BookingDetails[] = [];
          querySnapshot.forEach((doc) => {
            const data = doc.data();
            bookings.push({
              id: doc.id,
              ...data,
              scheduledDate: data['scheduledDate']?.toDate(),
              createdAt: data['createdAt']?.toDate(),
              updatedAt: data['updatedAt']?.toDate(),
              completedAt: data['completedAt']?.toDate(),
              cancelledAt: data['cancelledAt']?.toDate(),
              workerLocation: data['workerLocation']
                ? {
                    ...data['workerLocation'],
                    lastUpdated:
                      data['workerLocation']['lastUpdated']?.toDate(),
                  }
                : undefined,
            } as BookingDetails);
          });
          this.bookingsSubject.next(bookings);
          observer.next(bookings);
        },
        (error) => {
          console.error('Error loading bookings:', error);
          observer.error(error);
        }
      );

      return { unsubscribe };
    });
  }

  /**
   * Load user's active quick bookings
   */
  loadActiveQuickBookings(userId: string): Observable<BookingDetails[]> {
    const quickBookingsRef = collection(this.firestore, 'quickbookings');
    const q = query(
      quickBookingsRef,
      where('clientId', '==', userId),
      where('status', 'in', [
        'searching',
        'accepted',
        'on-the-way',
        'in-progress',
      ]),
      orderBy('createdAt', 'desc')
    );

    return new Observable((observer) => {
      const unsubscribe = onSnapshot(
        q,
        (querySnapshot) => {
          const quickBookings: BookingDetails[] = [];
          querySnapshot.forEach((doc) => {
            const data = doc.data();
            // Convert quick booking format to regular booking format for display
            quickBookings.push({
              id: doc.id,
              clientId: data['clientId'],
              workerId: data['assignedWorker'] || '',
              workerName: data['workerName'] || 'Searching...',
              workerAvatar: data['workerAvatar'],
              serviceType: data['subService'] || data['categoryName'],
              serviceCategory: data['categoryName'],
              status:
                data['status'] === 'searching' ? 'pending' : data['status'],
              scheduledDate:
                data['scheduledDate']?.toDate() || data['createdAt']?.toDate(),
              scheduledTime: data['scheduledTime'] || 'ASAP',
              address: data['location']?.address || '',
              coordinates: data['location']
                ? {
                    latitude: data['location'].lat,
                    longitude: data['location'].lng,
                  }
                : undefined,
              description: data['subService'] || '',
              price: data['pricing']?.total || 0,
              estimatedDuration: data['estimatedDuration'] || 60,
              createdAt: data['createdAt']?.toDate(),
              updatedAt:
                data['updatedAt']?.toDate() || data['createdAt']?.toDate(),
            } as BookingDetails);
          });
          observer.next(quickBookings);
        },
        (error) => {
          console.error('Error loading quick bookings:', error);
          observer.error(error);
        }
      );

      return { unsubscribe };
    });
  }

  /**
   * Load user's recent workers (from booking history)
   */
  async loadRecentWorkers(userId: string): Promise<WorkerProfile[]> {
    try {
      // Get completed bookings to find recent workers
      const bookingsRef = collection(this.firestore, 'bookings');
      const recentBookingsQuery = query(
        bookingsRef,
        where('clientId', '==', userId),
        where('status', '==', 'completed'),
        orderBy('completedAt', 'desc')
      );

      const bookingsSnapshot = await getDocs(recentBookingsQuery);
      const workerIds = new Set<string>();
      const workerBookingData = new Map<string, any>();

      // Collect unique worker IDs and their booking data
      bookingsSnapshot.docs.slice(0, 10).forEach((doc) => {
        const booking = doc.data();
        workerIds.add(booking['workerId']);
        if (!workerBookingData.has(booking['workerId'])) {
          workerBookingData.set(booking['workerId'], {
            lastBooking: booking['completedAt']?.toDate(),
            totalBookings: 1,
            lastRating: booking['rating'] || 0,
          });
        } else {
          const existing = workerBookingData.get(booking['workerId']);
          existing.totalBookings++;
        }
      });

      // Load worker profiles
      const workers: WorkerProfile[] = [];
      for (const workerId of workerIds) {
        const workerDoc = await getDoc(doc(this.firestore, 'users', workerId));
        if (workerDoc.exists()) {
          const workerData = workerDoc.data();
          const bookingInfo = workerBookingData.get(workerId);
          workers.push({
            id: workerId,
            ...workerData,
            joinedDate: workerData['joinedDate']?.toDate(),
            location: workerData['location']
              ? {
                  ...workerData['location'],
                  lastUpdated: workerData['location']['lastUpdated']?.toDate(),
                }
              : undefined,
          } as WorkerProfile);
        }
      }

      this.workersSubject.next(workers);
      return workers;
    } catch (error) {
      console.error('Error loading recent workers:', error);
      return [];
    }
  }

  /**
   * Load user notifications
   */
  loadNotifications(userId: string): Observable<NotificationData[]> {
    const notificationsRef = collection(this.firestore, 'notifications');
    const q = query(
      notificationsRef,
      where('userId', '==', userId),
      where('expiresAt', '>', new Date()),
      orderBy('createdAt', 'desc')
    );

    return new Observable((observer) => {
      const unsubscribe = onSnapshot(
        q,
        (querySnapshot) => {
          const notifications: NotificationData[] = [];
          querySnapshot.forEach((doc) => {
            const data = doc.data();
            notifications.push({
              id: doc.id,
              ...data,
              createdAt: data['createdAt']?.toDate(),
              readAt: data['readAt']?.toDate(),
              expiresAt: data['expiresAt']?.toDate(),
            } as NotificationData);
          });
          this.notificationsSubject.next(notifications);
          observer.next(notifications);
        },
        (error) => {
          console.error('Error loading notifications:', error);
          observer.error(error);
        }
      );

      return { unsubscribe };
    });
  }

  /**
   * Get service categories
   */
  async getServiceCategories(): Promise<ServiceCategory[]> {
    try {
      const categoriesRef = collection(this.firestore, 'serviceCategories');
      const q = query(categoriesRef, orderBy('createdAt', 'desc'));
      const querySnapshot = await getDocs(q);

      const categories: ServiceCategory[] = [];
      querySnapshot.forEach((doc) => {
        categories.push({
          id: doc.id,
          ...doc.data(),
        } as ServiceCategory);
      });

      return categories;
    } catch (error) {
      console.error('Error loading service categories:', error);
      return [];
    }
  }

  /**
   * Get worker's current location for tracking
   */
  async getWorkerLocation(workerId: string): Promise<{
    latitude: number;
    longitude: number;
    lastUpdated: Date;
  } | null> {
    try {
      const workerDoc = await getDoc(
        doc(this.firestore, 'worker_locations', workerId)
      );
      if (workerDoc.exists()) {
        const data = workerDoc.data();
        return {
          latitude: data['latitude'],
          longitude: data['longitude'],
          lastUpdated: data['lastUpdated']?.toDate(),
        };
      }
      return null;
    } catch (error) {
      console.error('Error getting worker location:', error);
      return null;
    }
  }

  /**
   * Mark notification as read
   */
  async markNotificationAsRead(notificationId: string): Promise<void> {
    try {
      const { updateDoc } = await import('@angular/fire/firestore');
      const notificationRef = doc(
        this.firestore,
        'notifications',
        notificationId
      );
      await updateDoc(notificationRef, {
        isRead: true,
        readAt: new Date(),
      });
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  }

  /**
   * Get dashboard statistics
   */
  async getDashboardStats(userId: string): Promise<{
    totalBookings: number;
    completedBookings: number;
    activeBookings: number;
    favoriteWorkers: number;
    totalSpent: number;
  }> {
    try {
      const bookingsRef = collection(this.firestore, 'bookings');
      const userBookingsQuery = query(
        bookingsRef,
        where('clientId', '==', userId)
      );
      const bookingsSnapshot = await getDocs(userBookingsQuery);

      let totalBookings = 0;
      let completedBookings = 0;
      let activeBookings = 0;
      let totalSpent = 0;

      bookingsSnapshot.forEach((doc) => {
        const booking = doc.data();
        totalBookings++;

        if (booking['status'] === 'completed') {
          completedBookings++;
          totalSpent += booking['price'] || 0;
        } else if (
          ['pending', 'accepted', 'on-the-way', 'in-progress'].includes(
            booking['status']
          )
        ) {
          activeBookings++;
        }
      });

      return {
        totalBookings,
        completedBookings,
        activeBookings,
        favoriteWorkers: 0, // Would need separate favorites collection
        totalSpent,
      };
    } catch (error) {
      console.error('Error getting dashboard stats:', error);
      return {
        totalBookings: 0,
        completedBookings: 0,
        activeBookings: 0,
        favoriteWorkers: 0,
        totalSpent: 0,
      };
    }
  }

  /**
   * Get admin analytics data
   */
  async getAnalytics(): Promise<{
    totalClients: number;
    totalWorkers: number;
    pendingVerifications: number;
    activeBookings: number;
    completedBookings: number;
    totalRevenue: number;
  }> {
    try {
      // Get client count from users collection
      const usersRef = collection(this.firestore, 'users');
      const clientsQuery = query(usersRef, where('role', '==', 'client'));
      const clientsSnapshot = await getDocs(clientsQuery);
      const totalClients = clientsSnapshot.size;

      // Get worker statistics from workers collection
      const workersRef = collection(this.firestore, 'workers');
      const workersSnapshot = await getDocs(workersRef);
      const totalWorkers = workersSnapshot.size;

      let pendingVerifications = 0;
      workersSnapshot.forEach((doc) => {
        const worker = doc.data();
        if (worker['status'] === 'pending_verification') {
          pendingVerifications++;
        }
      });

      // Get booking statistics
      const bookingsRef = collection(this.firestore, 'bookings');
      const bookingsSnapshot = await getDocs(bookingsRef);

      let activeBookings = 0;
      let completedBookings = 0;
      let totalRevenue = 0;

      bookingsSnapshot.forEach((doc) => {
        const booking = doc.data();
        const status = booking['status'];

        if (
          ['pending', 'accepted', 'on-the-way', 'in-progress'].includes(status)
        ) {
          activeBookings++;
        } else if (status === 'completed') {
          completedBookings++;
          // Calculate revenue (assuming 10% service fee from booking price)
          const bookingPrice = booking['price'] || 0;
          totalRevenue += bookingPrice * 0.1; // 10% service fee
        }
      });

      console.log('Analytics Data:', {
        totalClients,
        totalWorkers,
        pendingVerifications,
        activeBookings,
        completedBookings,
        totalRevenue,
      });

      return {
        totalClients,
        totalWorkers,
        pendingVerifications,
        activeBookings,
        completedBookings,
        totalRevenue,
      };
    } catch (error) {
      console.error('Error getting admin analytics:', error);
      // Return mock data as fallback
      return {
        totalClients: 0,
        totalWorkers: 0,
        pendingVerifications: 0,
        activeBookings: 0,
        completedBookings: 0,
        totalRevenue: 0,
      };
    }
  }

  /**
   * Add a new service category
   */
  async addServiceCategory(service: ServiceCategory): Promise<void> {
    try {
      const serviceRef = doc(this.firestore, 'serviceCategories', service.id);
      await setDoc(serviceRef, {
        ...service,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    } catch (error) {
      console.error('Error adding service category:', error);
      throw error;
    }
  }

  /**
   * Update an existing service category
   */
  async updateServiceCategory(service: ServiceCategory): Promise<void> {
    try {
      const serviceRef = doc(this.firestore, 'serviceCategories', service.id);
      await updateDoc(serviceRef, {
        ...service,
        updatedAt: new Date(),
      });
    } catch (error) {
      console.error('Error updating service category:', error);
      throw error;
    }
  }

  /**
   * Delete a service category
   */
  async deleteServiceCategory(serviceId: string): Promise<void> {
    try {
      const serviceRef = doc(this.firestore, 'serviceCategories', serviceId);
      await deleteDoc(serviceRef);
    } catch (error) {
      console.error('Error deleting service category:', error);
      throw error;
    }
  }

  /**
   * Get users by role
   */
  async getUsersByRole(
    role: 'client' | 'worker' | 'admin'
  ): Promise<UserProfile[]> {
    try {
      console.log(`Getting users with role: ${role}`);
      const usersRef = collection(this.firestore, 'users');

      // First try with role filter only (no orderBy to avoid index issues)
      const q = query(usersRef, where('role', '==', role));
      const querySnapshot = await getDocs(q);

      console.log(`Found ${querySnapshot.size} documents with role filter`);

      // If no results, try getting all users and filter manually
      if (querySnapshot.size === 0) {
        console.log('No results with role filter, trying to get all users...');
        const allUsersSnapshot = await getDocs(usersRef);
        console.log(`Found ${allUsersSnapshot.size} total documents`);

        const users: UserProfile[] = [];
        allUsersSnapshot.forEach((doc) => {
          const userData = doc.data();
          console.log('All users doc:', doc.id, userData);
          if (userData['role'] === role) {
            // Convert Firestore timestamps to Date objects
            const convertedUserData = {
              ...userData,
              uid: doc.id,
              createdAt: userData['createdAt']?.toDate
                ? userData['createdAt'].toDate()
                : new Date(),
              savedLocations:
                userData['savedLocations']?.map((location: any) => ({
                  ...location,
                  createdAt: location.createdAt?.toDate
                    ? location.createdAt.toDate()
                    : new Date(),
                })) || [],
            };

            users.push(convertedUserData as UserProfile);
          }
        });

        console.log(`Filtered ${users.length} users with role ${role}`);
        return users;
      }

      const users: UserProfile[] = [];
      querySnapshot.forEach((doc) => {
        console.log('User doc:', doc.id, doc.data());
        const userData = doc.data();

        // Convert Firestore timestamps to Date objects
        const convertedUserData = {
          uid: doc.id,
          ...userData,
          createdAt: userData['createdAt']?.toDate
            ? userData['createdAt'].toDate()
            : new Date(),
          savedLocations:
            userData['savedLocations']?.map((location: any) => ({
              ...location,
              createdAt: location.createdAt?.toDate
                ? location.createdAt.toDate()
                : new Date(),
            })) || [],
        };

        users.push(convertedUserData as UserProfile);
      });

      console.log(`Returning ${users.length} users:`, users);
      return users;
    } catch (error) {
      console.error(`Error loading ${role} users:`, error);
      return [];
    }
  }
}
