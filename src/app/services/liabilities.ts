import { Injectable } from '@angular/core';
import {
  Firestore,
  collection,
  query,
  where,
  getDocs,
  getDoc,
  addDoc,
  updateDoc,
  doc,
  Timestamp,
  orderBy,
  onSnapshot,
} from '@angular/fire/firestore';
import { Observable } from 'rxjs';

export interface DailyLiability {
  date: Date;
  bookingsCount: number;
  quickBookingsCount: number;
  totalServiceFee: number;
  totalServiceCharge: number;
  totalLiability: number;
  status: 'pending' | 'paid' | 'overdue';
  paymentProofUrl?: string;
  referenceNumber?: string;
  paidAt?: Date;
}

export interface PaymentSubmission {
  workerId: string;
  workerName: string;
  date: Date;
  amount: number;
  referenceNumber: string;
  paymentProofUrl: string;
  status: 'pending' | 'verified' | 'rejected';
  submittedAt: Date;
  verifiedAt?: Date;
  verifiedBy?: string;
  notes?: string;
}

// New interface for admin booking overview
export interface AdminBookingOverview {
  id: string;
  type: 'booking' | 'quickbooking';
  workerId: string;
  workerName: string;
  workerPhotoURL?: string;
  clientName?: string;
  serviceFee: number;
  serviceDate: Date;
  completedDate: Date;
  status: 'completed' | 'payment-confirmed' | 'payment-confirmed';
  paymentStatus: 'unpaid' | 'pending' | 'verified' | 'rejected';
  paymentSubmission?: PaymentSubmission;
}

export interface ServiceFeeData {
  date: Date;
  bookings: {
    count: number;
    totalServiceFee: number;
  };
  quickBookings: {
    count: number;
    totalServiceCharge: number;
  };
  totalAmount: number;
  status: 'pending' | 'paid' | 'overdue';
}

@Injectable({
  providedIn: 'root',
})
export class LiabilitiesService {
  constructor(private firestore: Firestore) {}

  // Calculate daily liabilities for a worker
  async calculateDailyLiabilities(
    workerId: string,
    startDate: Date,
    endDate: Date
  ): Promise<DailyLiability[]> {
    try {
      const liabilities: DailyLiability[] = [];
      const currentDate = new Date(startDate);

      while (currentDate <= endDate) {
        const dayStart = new Date(currentDate);
        dayStart.setHours(0, 0, 0, 0);

        const dayEnd = new Date(currentDate);
        dayEnd.setHours(23, 59, 59, 999);

        // Fetch completed bookings for this day
        const bookingsData = await this.getCompletedBookings(
          workerId,
          dayStart,
          dayEnd
        );

        // Fetch payment-confirmed quick bookings for this day
        const quickBookingsData = await this.getPaymentConfirmedQuickBookings(
          workerId,
          dayStart,
          dayEnd
        );

        const totalLiability =
          bookingsData.totalServiceFee + quickBookingsData.totalServiceCharge;

        if (totalLiability > 0) {
          // Check if there's a verified payment for this date
          const paymentStatus = await this.calculateStatusWithPayment(
            workerId,
            new Date(currentDate),
            totalLiability
          );

          liabilities.push({
            date: new Date(currentDate),
            bookingsCount: bookingsData.count,
            quickBookingsCount: quickBookingsData.count,
            totalServiceFee: bookingsData.totalServiceFee,
            totalServiceCharge: quickBookingsData.totalServiceCharge,
            totalLiability: totalLiability,
            status: paymentStatus,
          });
        }

        currentDate.setDate(currentDate.getDate() + 1);
      }

      return liabilities;
    } catch (error) {
      console.error('Error calculating daily liabilities:', error);
      throw error;
    }
  }

  // Get completed bookings for a specific date range
  private async getCompletedBookings(
    workerId: string,
    startDate: Date,
    endDate: Date
  ) {
    try {
      console.log('🔍 Querying completed bookings for:', {
        workerId,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
      });

      const bookingsRef = collection(this.firestore, 'bookings');
      // Query by worker and status first, then filter by date using completedAt/updatedAt/createdAt
      const statusValues = [
        'completed',
        'payment-confirmed',
        'payment-confirmed',
      ];
      const q = query(
        bookingsRef,
        where('assignedWorker', '==', workerId),
        where('status', 'in', statusValues)
      );

      const snapshot = await getDocs(q);
      let count = 0;
      let totalServiceFee = 0;

      console.log(
        `📊 Fetched ${snapshot.size} bookings matching status filter; applying date filter client-side`
      );

      snapshot.forEach((docSnap) => {
        const data = docSnap.data();

        // Determine a date to use for day filtering: completedAt > updatedAt > createdAt
        let referenceDate: Date | null = null;
        if (
          data['completedAt'] &&
          typeof data['completedAt'].toDate === 'function'
        ) {
          referenceDate = data['completedAt'].toDate();
        } else if (
          data['updatedAt'] &&
          typeof data['updatedAt'].toDate === 'function'
        ) {
          referenceDate = data['updatedAt'].toDate();
        } else if (
          data['createdAt'] &&
          typeof data['createdAt'].toDate === 'function'
        ) {
          referenceDate = data['createdAt'].toDate();
        }

        if (!referenceDate) {
          // If no date available, skip (or choose to include depending on business rules)
          console.warn(`Skipping booking ${docSnap.id} — no usable date field`);
          return;
        }

        if (referenceDate >= startDate && referenceDate <= endDate) {
          count++;
          // For bookings, serviceFee is nested under calculatedPayment
          const serviceFee =
            data['calculatedPayment']?.['serviceFee'] ||
            data['serviceFee'] ||
            0;
          totalServiceFee += Number(serviceFee) || 0;
          console.log('📋 Included Booking:', {
            id: docSnap.id,
            status: data['status'],
            referenceDate,
            serviceFee,
          });
        } else {
          console.log('⤷ Excluding Booking (date out of range):', {
            id: docSnap.id,
            status: data['status'],
            referenceDate,
          });
        }
      });

      const result = { count, totalServiceFee };
      console.log('✅ Completed bookings result after date filter:', result);

      return result;
    } catch (error) {
      console.error('❌ Error fetching completed bookings:', error);
      return { count: 0, totalServiceFee: 0 };
    }
  }

  // Get payment-confirmed quick bookings for a specific date range
  private async getPaymentConfirmedQuickBookings(
    workerId: string,
    startDate: Date,
    endDate: Date
  ) {
    try {
      console.log('🔍 Querying quick bookings for:', {
        workerId,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
      });
      const quickBookingsRef = collection(this.firestore, 'quickbookings');
      const statusValues = [
        'completed',
        'payment-confirmed',
        'payment-confirmed',
      ];
      const q = query(
        quickBookingsRef,
        where('assignedWorker', '==', workerId),
        where('status', 'in', statusValues)
      );

      const snapshot = await getDocs(q);
      let count = 0;
      let totalServiceCharge = 0;

      console.log(
        `📊 Fetched ${snapshot.size} quick bookings matching status filter; applying date filter client-side`
      );

      snapshot.forEach((docSnap) => {
        const data = docSnap.data();

        let referenceDate: Date | null = null;
        if (
          data['paymentConfirmedAt'] &&
          typeof data['paymentConfirmedAt'].toDate === 'function'
        ) {
          referenceDate = data['paymentConfirmedAt'].toDate();
        } else if (
          data['completedAt'] &&
          typeof data['completedAt'].toDate === 'function'
        ) {
          referenceDate = data['completedAt'].toDate();
        } else if (
          data['updatedAt'] &&
          typeof data['updatedAt'].toDate === 'function'
        ) {
          referenceDate = data['updatedAt'].toDate();
        } else if (
          data['createdAt'] &&
          typeof data['createdAt'].toDate === 'function'
        ) {
          referenceDate = data['createdAt'].toDate();
        }

        if (!referenceDate) {
          console.warn(
            `Skipping quickbooking ${docSnap.id} — no usable date field`
          );
          return;
        }

        if (referenceDate >= startDate && referenceDate <= endDate) {
          count++;
          // For quickbookings, serviceCharge is nested under finalPricing
          const serviceCharge =
            data['finalPricing']?.['serviceCharge'] ||
            data['serviceCharge'] ||
            0;
          totalServiceCharge += Number(serviceCharge) || 0;
          console.log('📋 Included QuickBooking:', {
            id: docSnap.id,
            status: data['status'],
            referenceDate,
            serviceCharge,
          });
        } else {
          console.log('⤷ Excluding QuickBooking (date out of range):', {
            id: docSnap.id,
            status: data['status'],
            referenceDate,
          });
        }
      });

      const result = { count, totalServiceCharge };
      console.log('✅ Quick bookings result after date filter:', result);

      return result;
    } catch (error) {
      console.error(
        '❌ Error fetching payment-confirmed quick bookings:',
        error
      );
      return { count: 0, totalServiceCharge: 0 };
    }
  }

  // Calculate status based on date and payment verification
  private async calculateStatusWithPayment(
    workerId: string,
    date: Date,
    amount: number
  ): Promise<'pending' | 'paid' | 'overdue'> {
    try {
      // Check if there's a verified payment submission for this date and worker
      const paymentSubmissionsRef = collection(
        this.firestore,
        'paymentSubmissions'
      );
      const dateStart = new Date(date);
      dateStart.setHours(0, 0, 0, 0);

      const dateEnd = new Date(date);
      dateEnd.setHours(23, 59, 59, 999);

      console.log('🔍 Checking payment status for:', {
        workerId,
        date: date.toDateString(),
        dateRange: {
          start: dateStart.toISOString(),
          end: dateEnd.toISOString(),
        },
        amount,
      });

      const q = query(
        paymentSubmissionsRef,
        where('workerId', '==', workerId),
        where('date', '>=', Timestamp.fromDate(dateStart)),
        where('date', '<=', Timestamp.fromDate(dateEnd)),
        where('status', '==', 'verified')
      );

      const snapshot = await getDocs(q);

      console.log(
        `📊 Found ${
          snapshot.size
        } verified payments for date ${date.toDateString()}`
      );

      // If there's a verified payment for this date, status is 'paid'
      if (!snapshot.empty) {
        console.log('✅ Payment found - status: PAID');
        return 'paid';
      }

      // Otherwise, use the original date-based calculation
      const status = this.calculateStatus(date);
      console.log(`⏰ No verified payment found - status: ${status}`);
      return status;
    } catch (error) {
      console.error('Error checking payment status:', error);
      // Fall back to date-based calculation if there's an error
      return this.calculateStatus(date);
    }
  }

  // Calculate status based on date
  private calculateStatus(date: Date): 'pending' | 'paid' | 'overdue' {
    const now = new Date();
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    if (now > endOfDay) {
      return 'overdue';
    }
    return 'pending';
  }

  // Submit payment proof
  async submitPayment(
    submission: Omit<PaymentSubmission, 'submittedAt'>
  ): Promise<string> {
    try {
      const paymentSubmissionsRef = collection(
        this.firestore,
        'paymentSubmissions'
      );

      // Ensure date is properly converted to Timestamp
      const submissionData = {
        ...submission,
        date: Timestamp.fromDate(submission.date),
        submittedAt: Timestamp.fromDate(new Date()),
        status: 'pending',
      };

      console.log('📤 Submitting payment with data:', {
        workerId: submissionData.workerId,
        date: submissionData.date.toDate(),
        amount: submissionData.amount,
        status: submissionData.status,
      });

      const docRef = await addDoc(paymentSubmissionsRef, submissionData);

      return docRef.id;
    } catch (error) {
      console.error('Error submitting payment:', error);
      throw error;
    }
  }

  // Get worker's payment submissions
  getWorkerPaymentSubmissions(
    workerId: string
  ): Observable<PaymentSubmission[]> {
    return new Observable((observer) => {
      const paymentSubmissionsRef = collection(
        this.firestore,
        'paymentSubmissions'
      );
      const q = query(
        paymentSubmissionsRef,
        where('workerId', '==', workerId),
        orderBy('submittedAt', 'desc')
      );

      const unsubscribe = onSnapshot(
        q,
        (snapshot) => {
          const submissions: PaymentSubmission[] = [];

          snapshot.forEach((doc) => {
            const data = doc.data();
            submissions.push({
              ...(data as PaymentSubmission),
              date: data['date'].toDate(),
              submittedAt: data['submittedAt'].toDate(),
              verifiedAt: data['verifiedAt']?.toDate(),
            });
          });

          observer.next(submissions);
        },
        (error) => {
          observer.error(error);
        }
      );

      return () => unsubscribe();
    });
  }

  // Get real-time worker liability updates
  getWorkerLiabilitiesObservable(
    workerId: string
  ): Observable<DailyLiability[]> {
    return new Observable((observer) => {
      const refreshLiabilities = async () => {
        try {
          console.log('🔄 Refreshing liabilities for worker:', workerId);
          const endDate = new Date();
          const startDate = new Date();
          startDate.setDate(startDate.getDate() - 30);

          const liabilities = await this.calculateDailyLiabilities(
            workerId,
            startDate,
            endDate
          );

          console.log(
            `📋 Calculated ${liabilities.length} liabilities:`,
            liabilities.map((l) => ({
              date: l.date.toDateString(),
              amount: l.totalLiability,
              status: l.status,
            }))
          );

          observer.next(liabilities);
        } catch (error) {
          console.error('❌ Error refreshing liabilities:', error);
          observer.error(error);
        }
      };

      // Listen for changes in payment submissions
      const paymentSubmissionsRef = collection(
        this.firestore,
        'paymentSubmissions'
      );
      const q = query(paymentSubmissionsRef, where('workerId', '==', workerId));

      console.log(
        '👂 Setting up real-time listener for payment submissions for worker:',
        workerId
      );

      const unsubscribe = onSnapshot(q, (snapshot) => {
        console.log(
          `🔔 Payment submission change detected: ${snapshot.size} submissions`
        );
        refreshLiabilities();
      });

      // Initial load
      refreshLiabilities();

      // Return cleanup function
      return () => {
        console.log('🧹 Cleaning up payment submissions listener');
        unsubscribe();
      };
    });
  }

  // Get today's liability for a worker with real-time updates
  getTodayLiabilityObservable(workerId: string): Observable<number> {
    return new Observable((observer) => {
      const calculateTodayLiability = async () => {
        try {
          const liability = await this.getTodayLiability(workerId);
          observer.next(liability);
        } catch (error) {
          observer.error(error);
        }
      };

      // Listen for changes in payment submissions
      const paymentSubmissionsRef = collection(
        this.firestore,
        'paymentSubmissions'
      );
      const q = query(paymentSubmissionsRef, where('workerId', '==', workerId));

      const unsubscribe = onSnapshot(q, () => {
        calculateTodayLiability();
      });

      // Initial load
      calculateTodayLiability();

      // Return cleanup function
      return () => unsubscribe();
    });
  }

  // Get today's liability with status for a worker with real-time updates
  getTodayLiabilityWithStatusObservable(
    workerId: string
  ): Observable<{ amount: number; status: 'pending' | 'paid' | 'overdue' }> {
    return new Observable((observer) => {
      const calculateTodayLiabilityWithStatus = async () => {
        try {
          const today = new Date();
          today.setHours(0, 0, 0, 0);

          const liabilities = await this.calculateDailyLiabilities(
            workerId,
            today,
            today
          );

          if (liabilities.length > 0) {
            observer.next({
              amount: liabilities[0].totalLiability,
              status: liabilities[0].status,
            });
          } else {
            observer.next({
              amount: 0,
              status: 'pending',
            });
          }
        } catch (error) {
          observer.error(error);
        }
      };

      // Listen for changes in payment submissions
      const paymentSubmissionsRef = collection(
        this.firestore,
        'paymentSubmissions'
      );
      const q = query(paymentSubmissionsRef, where('workerId', '==', workerId));

      console.log(
        "👂 Setting up real-time listener for today's liability with status for worker:",
        workerId
      );

      const unsubscribe = onSnapshot(q, (snapshot) => {
        console.log(
          `🔔 Today's liability payment submission change detected: ${snapshot.size} submissions`
        );
        calculateTodayLiabilityWithStatus();
      });

      // Initial load
      calculateTodayLiabilityWithStatus();

      // Return cleanup function
      return () => {
        console.log("🧹 Cleaning up today's liability status listener");
        unsubscribe();
      };
    });
  }

  // Get today's liability for a worker
  async getTodayLiability(workerId: string): Promise<number> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const liabilities = await this.calculateDailyLiabilities(
      workerId,
      today,
      today
    );
    return liabilities.length > 0 ? liabilities[0].totalLiability : 0;
  }

  // Get pending payment submissions for admin
  getPendingPaymentSubmissions(): Observable<PaymentSubmission[]> {
    return new Observable((observer) => {
      const paymentSubmissionsRef = collection(
        this.firestore,
        'paymentSubmissions'
      );
      const q = query(
        paymentSubmissionsRef,
        where('status', '==', 'pending'),
        orderBy('submittedAt', 'desc')
      );

      const unsubscribe = onSnapshot(
        q,
        (snapshot) => {
          const submissions: PaymentSubmission[] = [];

          snapshot.forEach((doc) => {
            const data = doc.data();
            submissions.push({
              ...(data as PaymentSubmission),
              id: doc.id,
              date: data['date'].toDate(),
              submittedAt: data['submittedAt'].toDate(),
              verifiedAt: data['verifiedAt']?.toDate(),
            } as PaymentSubmission & { id: string });
          });

          console.log('💰 Fetched payment submissions:', submissions.length);
          observer.next(submissions);
        },
        (error) => {
          console.error('❌ Error fetching payment submissions:', error);
          observer.error(error);
        }
      );

      return () => unsubscribe();
    });
  }

  // Get ALL payment submissions for admin (pending, verified, rejected)
  getAllPaymentSubmissions(): Observable<PaymentSubmission[]> {
    return new Observable((observer) => {
      const paymentSubmissionsRef = collection(
        this.firestore,
        'paymentSubmissions'
      );
      const q = query(paymentSubmissionsRef, orderBy('submittedAt', 'desc'));

      const unsubscribe = onSnapshot(
        q,
        (snapshot) => {
          const submissions: PaymentSubmission[] = [];

          snapshot.forEach((doc) => {
            const data = doc.data();
            submissions.push({
              ...(data as PaymentSubmission),
              id: doc.id,
              date: data['date'].toDate(),
              submittedAt: data['submittedAt'].toDate(),
              verifiedAt: data['verifiedAt']?.toDate(),
            } as PaymentSubmission & { id: string });
          });

          console.log(
            '💰 Fetched ALL payment submissions:',
            submissions.length
          );
          observer.next(submissions);
        },
        (error) => {
          console.error('❌ Error fetching all payment submissions:', error);
          observer.error(error);
        }
      );

      return () => unsubscribe();
    });
  }

  // Verify payment submission (admin function)
  async verifyPaymentSubmission(
    submissionId: string,
    adminId: string,
    status: 'verified' | 'rejected',
    notes?: string
  ): Promise<void> {
    try {
      const submissionRef = doc(
        this.firestore,
        'paymentSubmissions',
        submissionId
      );

      await updateDoc(submissionRef, {
        status,
        verifiedAt: Timestamp.fromDate(new Date()),
        verifiedBy: adminId,
        notes: notes || '',
      });
    } catch (error) {
      console.error('Error verifying payment submission:', error);
      throw error;
    }
  }

  // Send notification to worker (admin function)
  async sendWorkerNotification(
    workerId: string,
    message: string
  ): Promise<void> {
    try {
      const notificationsRef = collection(
        this.firestore,
        'workers',
        workerId,
        'notifications'
      );

      await addDoc(notificationsRef, {
        message,
        type: 'payment_reminder',
        createdAt: Timestamp.fromDate(new Date()),
        read: false,
      });
    } catch (error) {
      console.error('Error sending worker notification:', error);
      throw error;
    }
  }

  // Get all completed bookings and quickbookings with their payment status (admin function)
  async getAllBookingsWithPaymentStatus(): Promise<AdminBookingOverview[]> {
    try {
      console.log('🔍 Fetching all completed bookings and quickbookings...');

      const bookingsOverview: AdminBookingOverview[] = [];

      // Fetch all payment submissions first
      const paymentSubmissionsMap = new Map<string, PaymentSubmission>();
      const paymentSubmissionsRef = collection(
        this.firestore,
        'paymentSubmissions'
      );
      const paymentSnapshot = await getDocs(paymentSubmissionsRef);

      paymentSnapshot.forEach((doc) => {
        const data = doc.data();
        const key = `${data['workerId']}-${data['date']
          .toDate()
          .toDateString()}`;
        paymentSubmissionsMap.set(key, {
          ...(data as PaymentSubmission),
          id: doc.id,
          date: data['date'].toDate(),
          submittedAt: data['submittedAt'].toDate(),
          verifiedAt: data['verifiedAt']?.toDate(),
        } as PaymentSubmission & { id: string });
      });

      console.log(
        '💰 Loaded payment submissions map:',
        paymentSubmissionsMap.size
      );

      // Fetch completed bookings
      const bookingsRef = collection(this.firestore, 'bookings');
      const bookingsQuery = query(
        bookingsRef,
        where('status', '==', 'completed')
      );

      const bookingsSnapshot = await getDocs(bookingsQuery);
      console.log('📋 Found completed bookings:', bookingsSnapshot.size);

      for (const bookingDoc of bookingsSnapshot.docs) {
        const bookingData = bookingDoc.data();
        const workerId = bookingData['assignedWorker'];

        if (!workerId) {
          console.warn(
            `Skipping booking ${bookingDoc.id} - no assigned worker`
          );
          continue;
        }

        // Get worker details from both collections
        const [userDocRef, workerDocRef] = [
          doc(this.firestore, 'users', workerId),
          doc(this.firestore, 'workers', workerId),
        ];

        const [userDoc, workerDoc] = await Promise.all([
          getDoc(userDocRef),
          getDoc(workerDocRef),
        ]);

        const userData = userDoc.data();
        const workerData = workerDoc.data();

        // Debug: Log the actual user data to see what fields are available
        console.log('🔍 Debug - User data for worker:', workerId, userData);
        console.log('🔍 Debug - Worker data for worker:', workerId, workerData);

        // Get worker name from users collection and profile photo from workers collection
        const workerName =
          userData?.['name'] ||
          userData?.['displayName'] ||
          userData?.['fullName'] ||
          userData?.['firstName'] ||
          `Worker ${workerId.substring(0, 8)}` ||
          'Unknown Worker';
        const profilePhotoURL =
          workerData?.['profilePhotoData'] || workerData?.['photoURL'] || null;

        console.log('✅ Debug - Resolved worker name:', workerName);

        // For bookings, serviceFee is nested under calculatedPayment
        const serviceFee =
          bookingData['calculatedPayment']?.['serviceFee'] ||
          bookingData['serviceFee'] ||
          0;
        const completedDate =
          bookingData['completedAt']?.toDate() ||
          bookingData['updatedAt']?.toDate() ||
          bookingData['createdAt']?.toDate() ||
          new Date();
        const serviceDate =
          bookingData['schedule']?.['date']?.toDate() || completedDate;

        // Check payment status
        const paymentKey = `${workerId}-${serviceDate.toDateString()}`;
        const paymentSubmission = paymentSubmissionsMap.get(paymentKey);

        let paymentStatus: 'unpaid' | 'pending' | 'verified' | 'rejected' =
          'unpaid';
        if (paymentSubmission) {
          paymentStatus = paymentSubmission.status;
        }

        bookingsOverview.push({
          id: bookingDoc.id,
          type: 'booking',
          workerId,
          workerName,
          workerPhotoURL: profilePhotoURL,
          clientName: bookingData['clientName'],
          serviceFee,
          serviceDate,
          completedDate,
          status: 'completed',
          paymentStatus,
          paymentSubmission,
        });
      }

      // Fetch payment-confirmed quickbookings
      const quickBookingsRef = collection(this.firestore, 'quickbookings');
      const quickBookingsQuery = query(
        quickBookingsRef,
        where('status', '==', 'payment-confirmed')
      );

      const quickBookingsSnapshot = await getDocs(quickBookingsQuery);
      console.log(
        '⚡ Found payment-confirmed quickbookings:',
        quickBookingsSnapshot.size
      );

      for (const quickBookingDoc of quickBookingsSnapshot.docs) {
        const quickBookingData = quickBookingDoc.data();
        const workerId = quickBookingData['assignedWorker'];

        if (!workerId) {
          console.warn(
            `Skipping quickbooking ${quickBookingDoc.id} - no assigned worker`
          );
          continue;
        }

        // Get worker details from both collections
        const [userDocRef, workerDocRef] = [
          doc(this.firestore, 'users', workerId),
          doc(this.firestore, 'workers', workerId),
        ];

        const [userDoc, workerDoc] = await Promise.all([
          getDoc(userDocRef),
          getDoc(workerDocRef),
        ]);

        const userData = userDoc.data();
        const workerData = workerDoc.data();

        // Debug: Log the actual user data to see what fields are available
        console.log(
          '🔍 Debug - QuickBooking User data for worker:',
          workerId,
          userData
        );
        console.log(
          '🔍 Debug - QuickBooking Worker data for worker:',
          workerId,
          workerData
        );

        // Get worker name from users collection and profile photo from workers collection
        const workerName =
          userData?.['name'] ||
          userData?.['displayName'] ||
          userData?.['fullName'] ||
          userData?.['firstName'] ||
          `Worker ${workerId.substring(0, 8)}` ||
          'Unknown Worker';
        const profilePhotoURL =
          workerData?.['profilePhotoData'] || workerData?.['photoURL'] || null;

        console.log(
          '✅ Debug - QuickBooking Resolved worker name:',
          workerName
        );

        // For quickbookings, serviceCharge is nested under finalPricing
        const serviceFee =
          quickBookingData['finalPricing']?.['serviceCharge'] ||
          quickBookingData['serviceCharge'] ||
          0;
        const completedDate =
          quickBookingData['paymentReceivedAt']?.toDate() ||
          quickBookingData['updatedAt']?.toDate() ||
          quickBookingData['createdAt']?.toDate() ||
          new Date();
        const serviceDate =
          quickBookingData['schedule']?.['date']?.toDate() || completedDate;

        // Check payment status
        const paymentKey = `${workerId}-${serviceDate.toDateString()}`;
        const paymentSubmission = paymentSubmissionsMap.get(paymentKey);

        let paymentStatus: 'unpaid' | 'pending' | 'verified' | 'rejected' =
          'unpaid';
        if (paymentSubmission) {
          paymentStatus = paymentSubmission.status;
        }

        bookingsOverview.push({
          id: quickBookingDoc.id,
          type: 'quickbooking',
          workerId,
          workerName,
          workerPhotoURL: profilePhotoURL,
          clientName: quickBookingData['clientName'],
          serviceFee,
          serviceDate,
          completedDate,
          status: 'payment-confirmed',
          paymentStatus,
          paymentSubmission,
        });
      }

      // Sort by completed date (newest first)
      bookingsOverview.sort(
        (a, b) => b.completedDate.getTime() - a.completedDate.getTime()
      );

      console.log('✅ Total bookings overview:', bookingsOverview.length);
      return bookingsOverview;
    } catch (error) {
      console.error('❌ Error fetching bookings with payment status:', error);
      return [];
    }
  }
}
