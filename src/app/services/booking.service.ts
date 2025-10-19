import { Injectable } from '@angular/core';
import {
  Firestore,
  collection,
  query,
  where,
  orderBy,
  getDocs,
  getDoc,
  doc,
  updateDoc,
  addDoc,
  onSnapshot,
  Timestamp,
  CollectionReference,
  DocumentData,
} from '@angular/fire/firestore';
import { Observable, from } from 'rxjs';
import { map } from 'rxjs/operators';

export interface BookingLocation {
  address: string;
  coordinates?: {
    latitude: number;
    longitude: number;
  };
  isDefault?: boolean;
}

export interface BookingData {
  id?: string;
  clientId: string;
  clientName?: string;
  title?: string;
  description?: string;
  category?: string;
  neededService?: string;
  schedule?: {
    date: string;
    time: string;
  };
  scheduleDate?: Date;
  locations?: BookingLocation[];
  minBudget?: number;
  maxBudget?: number;
  priceRange?: number;
  additionalDetails?: string;
  priceType: 'per-hour' | 'per-day' | 'fixed-price';
  price: number;
  serviceCharge: number;
  transportFee: number;
  total: number;
  images: string[];
  status:
    | 'pending'
    | 'accepted'
    | 'on-the-way'
    | 'in-progress'
    | 'completed'
    | 'cancelled';
  createdAt: Date;
  updatedAt?: Date;
  // Worker information (populated when accepted)
  assignedWorker?: string;
  workerId?: string;
  workerName?: string;
  workerPhone?: string;
  // Completion information
  completedAt?: Date;
  rating?: number;
  review?: string;
  reviewedAt?: Date;
  // Cancellation information
  cancellationReason?: string;
  cancelledAt?: Date;
  cancellationFee?: number;
  // Payment information
  paymentDetails?: {
    status: 'pending' | 'completed' | 'failed';
    receiptId?: string;
    amount?: number;
    completedAt?: Date;
  };
}

// New interface for simplified booking structure from schedule-booking
export interface NewBookingData {
  workerId: string;
  workerName: string;
  clientId: string;
  serviceId: string;
  serviceName: string;
  date: Date;
  time: string;
  duration: number;
  price: number;
  address: string;
  notes: string;
  status: string;
  createdAt: Date;
  // Payment information
  paymentDetails?: {
    status: 'pending' | 'completed' | 'failed';
    receiptId?: string;
    amount?: number;
    completedAt?: Date;
  };
}

@Injectable({
  providedIn: 'root',
})
export class BookingService {
  private bookingsCollection: CollectionReference<DocumentData>;

  constructor(private firestore: Firestore) {
    this.bookingsCollection = collection(this.firestore, 'bookings');
  }

  /**
   * Create a new booking
   */
  async createBooking(bookingData: NewBookingData): Promise<string> {
    try {
      const docRef = await addDoc(this.bookingsCollection, {
        ...bookingData,
        createdAt: Timestamp.fromDate(bookingData.createdAt),
        date: Timestamp.fromDate(bookingData.date),
      });
      return docRef.id;
    } catch (error) {
      console.error('Error creating booking:', error);
      throw error;
    }
  }

  /**
   * Fetch all bookings for a specific user (including new format)
   */
  async getAllUserBookings(
    userId: string
  ): Promise<(BookingData | NewBookingData)[]> {
    try {
      const q = query(
        this.bookingsCollection,
        where('clientId', '==', userId),
        orderBy('createdAt', 'desc')
      );

      const querySnapshot = await getDocs(q);
      const bookings: (BookingData | NewBookingData)[] = [];

      querySnapshot.forEach((doc) => {
        const data = doc.data();
        const booking = {
          id: doc.id,
          ...data,
          createdAt: data['createdAt']?.toDate
            ? data['createdAt'].toDate()
            : new Date(),
          date: data['date']?.toDate ? data['date'].toDate() : data['date'],
          updatedAt: data['updatedAt']?.toDate
            ? data['updatedAt'].toDate()
            : undefined,
        } as any;
        bookings.push(booking);
      });

      return bookings;
    } catch (error) {
      console.error('Error fetching user bookings:', error);
      throw error;
    }
  }

  /**
   * Fetch all bookings for a specific user (old format)
   */
  async getUserBookings(userId: string): Promise<BookingData[]> {
    try {
      const q = query(
        this.bookingsCollection,
        where('clientId', '==', userId),
        orderBy('createdAt', 'desc')
      );

      const querySnapshot = await getDocs(q);
      const bookings: BookingData[] = [];

      querySnapshot.forEach((doc) => {
        const data = doc.data();

        // Convert Firestore Timestamp to Date
        const createdAt =
          data['createdAt'] instanceof Timestamp
            ? data['createdAt'].toDate()
            : new Date(data['createdAt']);

        const updatedAt =
          data['updatedAt'] instanceof Timestamp
            ? data['updatedAt'].toDate()
            : data['updatedAt']
            ? new Date(data['updatedAt'])
            : undefined;

        const completedAt =
          data['completedAt'] instanceof Timestamp
            ? data['completedAt'].toDate()
            : data['completedAt']
            ? new Date(data['completedAt'])
            : undefined;

        bookings.push({
          id: doc.id,
          ...data,
          createdAt,
          updatedAt,
          completedAt,
        } as BookingData);
      });

      return bookings;
    } catch (error) {
      console.error('Error fetching user bookings:', error);
      throw error;
    }
  }

  /**
   * Get bookings as an Observable for real-time updates
   */
  getUserBookings$(userId: string): Observable<BookingData[]> {
    return from(this.getUserBookings(userId));
  }

  /**
   * Update booking status
   */
  async updateBookingStatus(
    bookingId: string,
    status: BookingData['status'],
    additionalData?: Partial<BookingData>
  ): Promise<void> {
    try {
      const bookingRef = doc(this.firestore, 'bookings', bookingId);
      const updateData: any = {
        status,
        updatedAt: new Date(),
        ...additionalData,
      };

      if (status === 'completed') {
        updateData.completedAt = new Date();
      }

      await updateDoc(bookingRef, updateData);
    } catch (error) {
      console.error('Error updating booking status:', error);
      throw error;
    }
  }

  /**
   * Check if a booking can be cancelled based on cancellation policy
   */
  async canCancelBooking(
    bookingId: string
  ): Promise<{ canCancel: boolean; reason?: string; feeApplies?: boolean }> {
    try {
      const bookingDoc = await getDoc(
        doc(this.firestore, 'bookings', bookingId)
      );

      if (!bookingDoc.exists()) {
        return { canCancel: false, reason: 'Booking not found' };
      }

      const booking = bookingDoc.data();
      const currentTime = new Date();

      // Cannot cancel completed or already cancelled bookings
      if (
        booking['status'] === 'completed' ||
        booking['status'] === 'cancelled'
      ) {
        return {
          canCancel: false,
          reason: `Cannot cancel ${booking['status']} booking`,
        };
      }

      // Free cancellation for pending bookings (within 1 hour of creation)
      if (booking['status'] === 'pending') {
        const createdAt = booking['createdAt']?.toDate();
        if (createdAt) {
          const timeDiff =
            (currentTime.getTime() - createdAt.getTime()) / (1000 * 60 * 60); // hours

          if (timeDiff <= 1) {
            return { canCancel: true, feeApplies: false };
          } else {
            return {
              canCancel: true,
              feeApplies: true,
              reason:
                'Cancellation fee may apply (booking created more than 1 hour ago)',
            };
          }
        }
      }

      // Accepted bookings - check time before service
      if (booking['status'] === 'accepted') {
        const schedule = booking['schedule'];
        if (schedule && schedule.date && schedule.time) {
          const scheduledDate = new Date(schedule.date + ' ' + schedule.time);
          const hoursUntilService =
            (scheduledDate.getTime() - currentTime.getTime()) /
            (1000 * 60 * 60);

          if (hoursUntilService >= 2) {
            return {
              canCancel: true,
              feeApplies: true,
              reason: 'Cancellation fee applies for accepted bookings',
            };
          } else if (hoursUntilService >= 0) {
            return {
              canCancel: true,
              feeApplies: true,
              reason:
                'Late cancellation fee applies (less than 2 hours before service)',
            };
          } else {
            return {
              canCancel: false,
              reason: 'Cannot cancel booking after scheduled service time',
            };
          }
        }
      }

      // Cannot cancel if worker is on the way or already working
      if (
        booking['status'] === 'on-the-way' ||
        booking['status'] === 'in-progress'
      ) {
        return {
          canCancel: false,
          reason:
            'Cannot cancel once worker has started traveling or is working. Please contact support.',
        };
      }

      return {
        canCancel: false,
        reason: 'Booking cannot be cancelled at this time',
      };
    } catch (error) {
      console.error('Error checking cancellation eligibility:', error);
      return {
        canCancel: false,
        reason: 'Unable to check cancellation policy',
      };
    }
  }

  /**
   * Cancel a booking with enhanced policy checking
   */
  async cancelBooking(bookingId: string, reason?: string): Promise<void> {
    try {
      // Check cancellation policy first
      const canCancel = await this.canCancelBooking(bookingId);

      if (!canCancel.canCancel) {
        throw new Error(canCancel.reason || 'Booking cannot be cancelled');
      }

      // Calculate cancellation fee if applicable
      let cancellationFee = 0;
      if (canCancel.feeApplies) {
        // Get booking data to calculate fee
        const bookingDoc = await getDoc(
          doc(this.firestore, 'bookings', bookingId)
        );
        if (bookingDoc.exists()) {
          const booking = bookingDoc.data();
          const total = booking['total'] || booking['price'] || 0;

          // Different fee rates based on timing
          if (booking['status'] === 'pending') {
            cancellationFee = total * 0.1; // 10% fee for late pending cancellations
          } else if (booking['status'] === 'accepted') {
            const schedule = booking['schedule'];
            if (schedule && schedule.date && schedule.time) {
              const scheduledDate = new Date(
                schedule.date + ' ' + schedule.time
              );
              const hoursUntilService =
                (new Date().getTime() - scheduledDate.getTime()) /
                (1000 * 60 * 60);

              if (hoursUntilService < 2) {
                cancellationFee = total * 0.5; // 50% fee for last-minute cancellations
              } else {
                cancellationFee = total * 0.2; // 20% fee for standard cancellations
              }
            }
          }
        }
      }

      await this.updateBookingStatus(bookingId, 'cancelled', {
        cancellationReason: reason,
        cancelledAt: new Date(),
        cancellationFee: cancellationFee,
      });
    } catch (error) {
      console.error('Error cancelling booking:', error);
      throw error;
    }
  }

  /**
   * Add rating and review to completed booking
   */
  async rateBooking(
    bookingId: string,
    rating: number,
    review?: string
  ): Promise<void> {
    try {
      const bookingRef = doc(this.firestore, 'bookings', bookingId);
      await updateDoc(bookingRef, {
        rating,
        review: review || '',
        reviewedAt: new Date(),
        updatedAt: new Date(),
      });
    } catch (error) {
      console.error('Error rating booking:', error);
      throw error;
    }
  }

  /**
   * Get bookings by status for a user
   */
  async getUserBookingsByStatus(
    userId: string,
    status: BookingData['status']
  ): Promise<BookingData[]> {
    try {
      const q = query(
        this.bookingsCollection,
        where('clientId', '==', userId),
        where('status', '==', status),
        orderBy('createdAt', 'desc')
      );

      const querySnapshot = await getDocs(q);
      const bookings: BookingData[] = [];

      querySnapshot.forEach((doc) => {
        const data = doc.data();

        const createdAt =
          data['createdAt'] instanceof Timestamp
            ? data['createdAt'].toDate()
            : new Date(data['createdAt']);

        bookings.push({
          id: doc.id,
          ...data,
          createdAt,
        } as BookingData);
      });

      return bookings;
    } catch (error) {
      console.error('Error fetching bookings by status:', error);
      throw error;
    }
  }

  /**
   * Get booking statistics for a user
   */
  async getUserBookingStats(userId: string): Promise<{
    total: number;
    pending: number;
    inProgress: number;
    completed: number;
    cancelled: number;
  }> {
    try {
      const bookings = await this.getUserBookings(userId);

      return {
        total: bookings.length,
        pending: bookings.filter((b) => b.status === 'pending').length,
        inProgress: bookings.filter((b) =>
          ['accepted', 'on-the-way', 'in-progress'].includes(b.status)
        ).length,
        completed: bookings.filter((b) => b.status === 'completed').length,
        cancelled: bookings.filter((b) => b.status === 'cancelled').length,
      };
    } catch (error) {
      console.error('Error getting booking stats:', error);
      throw error;
    }
  }

  /**
   * Get all pending bookings (for workers to browse)
   */
  async getPendingBookings(): Promise<BookingData[]> {
    try {
      const q = query(
        this.bookingsCollection,
        where('status', '==', 'pending'),
        orderBy('createdAt', 'desc')
      );

      const querySnapshot = await getDocs(q);
      const bookings: BookingData[] = [];

      querySnapshot.forEach((doc) => {
        const data = doc.data();
        const createdAt =
          data['createdAt'] instanceof Timestamp
            ? data['createdAt'].toDate()
            : new Date(data['createdAt']);

        bookings.push({
          id: doc.id,
          ...data,
          createdAt,
        } as BookingData);
      });

      return bookings;
    } catch (error) {
      console.error('Error getting pending bookings:', error);
      throw error;
    }
  }

  /**
   * Get jobs assigned to a specific worker
   */
  async getWorkerJobs(workerId: string): Promise<BookingData[]> {
    try {
      const q = query(
        this.bookingsCollection,
        where('workerId', '==', workerId),
        where('status', 'in', ['accepted', 'on-the-way', 'in-progress']),
        orderBy('createdAt', 'desc')
      );

      const querySnapshot = await getDocs(q);
      const bookings: BookingData[] = [];

      querySnapshot.forEach((doc) => {
        const data = doc.data();
        const createdAt =
          data['createdAt'] instanceof Timestamp
            ? data['createdAt'].toDate()
            : new Date(data['createdAt']);

        bookings.push({
          id: doc.id,
          ...data,
          createdAt,
        } as BookingData);
      });

      return bookings;
    } catch (error) {
      console.error('Error getting worker jobs:', error);
      throw error;
    }
  }

  /**
   * Get completed jobs for a specific worker
   */
  async getCompletedJobsByWorker(workerId: string): Promise<BookingData[]> {
    try {
      const q = query(
        this.bookingsCollection,
        where('workerId', '==', workerId),
        where('status', '==', 'completed'),
        orderBy('completedAt', 'desc')
      );

      const querySnapshot = await getDocs(q);
      const bookings: BookingData[] = [];

      querySnapshot.forEach((doc) => {
        const data = doc.data();
        const createdAt =
          data['createdAt'] instanceof Timestamp
            ? data['createdAt'].toDate()
            : new Date(data['createdAt']);

        const completedAt =
          data['completedAt'] instanceof Timestamp
            ? data['completedAt'].toDate()
            : data['completedAt']
            ? new Date(data['completedAt'])
            : undefined;

        bookings.push({
          id: doc.id,
          ...data,
          createdAt,
          completedAt,
        } as BookingData);
      });

      return bookings;
    } catch (error) {
      console.error('Error getting completed jobs by worker:', error);
      throw error;
    }
  }

  /**
   * Accept a booking (worker action)
   */
  async acceptBooking(bookingId: string, workerId: string): Promise<void> {
    try {
      const bookingRef = doc(this.firestore, 'bookings', bookingId);
      await updateDoc(bookingRef, {
        status: 'accepted',
        workerId: workerId,
        progress: 'Worker accepted your booking!',
        updatedAt: Timestamp.now(),
      });

      // Update worker's current job
      const workerRef = doc(this.firestore, 'workers', workerId);
      await updateDoc(workerRef, {
        currentJobId: bookingId,
        updatedAt: Timestamp.now(),
      });
    } catch (error) {
      console.error('Error accepting booking:', error);
      throw error;
    }
  }

  /**
   * Reject a booking (worker declines the job)
   */
  async rejectBooking(bookingId: string): Promise<void> {
    try {
      const bookingRef = doc(this.firestore, 'bookings', bookingId);
      await updateDoc(bookingRef, {
        status: 'rejected',
        progress: 'Booking rejected by worker.',
        updatedAt: Timestamp.now(),
      });
    } catch (error) {
      console.error('Error rejecting booking:', error);
      throw error;
    }
  }

  /**
   * Get a single booking by ID
   */
  async getBookingById(bookingId: string): Promise<BookingData | null> {
    try {
      const bookingRef = doc(this.firestore, 'bookings', bookingId);
      const bookingDoc = await getDoc(bookingRef);

      if (bookingDoc.exists()) {
        return {
          id: bookingDoc.id,
          ...bookingDoc.data(),
        } as BookingData;
      } else {
        return null;
      }
    } catch (error) {
      console.error('Error getting booking by ID:', error);
      throw error;
    }
  }

  /**
   * Get a booking by ID as an Observable for real-time updates
   */
  getBookingById$(bookingId: string): Observable<BookingData | null> {
    return new Observable((observer) => {
      const bookingRef = doc(this.firestore, 'bookings', bookingId);
      const unsubscribe = onSnapshot(
        bookingRef,
        (doc) => {
          if (doc.exists()) {
            observer.next({
              id: doc.id,
              ...doc.data(),
            } as BookingData);
          } else {
            observer.next(null);
          }
        },
        (error) => {
          observer.error(error);
        }
      );

      return () => unsubscribe();
    });
  }

  /**
   * Get pending bookings assigned to a specific worker (real-time)
   */
  getPendingBookingsForWorker$(workerId: string): Observable<BookingData[]> {
    return new Observable((observer) => {
      console.log('🔍 Querying pending bookings for worker:', workerId);
      
      const q = query(
        this.bookingsCollection,
        where('assignedWorker', '==', workerId),
        where('status', '==', 'pending'),
        orderBy('createdAt', 'desc')
      );

      const unsubscribe = onSnapshot(
        q,
        (querySnapshot) => {
          console.log('📊 Query snapshot received. Size:', querySnapshot.size);
          const bookings: BookingData[] = [];
          querySnapshot.forEach((doc) => {
            const data = doc.data();
            console.log('📄 Document found:', doc.id, data);
            const booking = {
              id: doc.id,
              ...data,
              createdAt: data['createdAt']?.toDate
                ? data['createdAt'].toDate()
                : new Date(),
              updatedAt: data['updatedAt']?.toDate
                ? data['updatedAt'].toDate()
                : undefined,
              completedAt: data['completedAt']?.toDate
                ? data['completedAt'].toDate()
                : undefined,
            } as BookingData;
            bookings.push(booking);
          });
          console.log('📥 Final bookings array:', bookings);
          observer.next(bookings);
        },
        (error) => {
          console.error('❌ Query error:', error);
          observer.error(error);
        }
      );

      return () => unsubscribe();
    });
  }
}
