import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import {
  Firestore,
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  doc,
  updateDoc,
  addDoc,
  getDoc,
  serverTimestamp,
  Timestamp,
} from '@angular/fire/firestore';
import { AuthService } from './auth.service';
import { NotificationService } from './notification.service';

export interface JobData {
  id: string;
  clientId: string;
  categoryId: string;
  categoryName: string;
  subService: string;
  title: string;
  description: string;
  location: {
    lat: number;
    lng: number;
    address: string;
  };
  pricing: {
    basePrice: number;
    serviceCharge: number;
    transportFee: number;
    total: number;
  };
  estimatedDuration: string;
  schedule: {
    date: string;
    time: string;
  };
  status: 'searching' | 'accepted' | 'in_progress' | 'completed' | 'cancelled';
  assignedWorker?: string;
  clientName?: string;
  clientPhone?: string;
  distance?: number;
  isProcessing?: boolean;
  createdAt: any;
  acceptedAt?: any;
  startedAt?: any;
  completedAt?: any;
}

@Injectable({
  providedIn: 'root',
})
export class JobManagementService {
  private availableJobs$ = new BehaviorSubject<JobData[]>([]);
  private ongoingJobs$ = new BehaviorSubject<JobData[]>([]);
  private currentUserId: string | null = null;

  constructor(
    private firestore: Firestore,
    private authService: AuthService,
    private notificationService: NotificationService
  ) {
    this.initializeJobListeners();
  }

  private initializeJobListeners() {
    this.authService.currentUser$.subscribe((user) => {
      if (user?.uid && user.uid !== this.currentUserId) {
        this.currentUserId = user.uid;
        this.setupJobListeners();
      } else if (!user) {
        this.currentUserId = null;
        this.availableJobs$.next([]);
        this.ongoingJobs$.next([]);
      }
    });
  }

  private setupJobListeners() {
    if (!this.currentUserId) return;

    // Listen for available jobs (searching status)
    this.setupAvailableJobsListener();

    // Listen for ongoing jobs (accepted, in_progress)
    this.setupOngoingJobsListener();
  }

  private setupAvailableJobsListener() {
    // Setup listeners for quick bookings only for available jobs
    this.setupBookingTypeListener('quickbookings');
  }

  private setupBookingTypeListener(collectionName: string) {
    const bookingsRef = collection(this.firestore, collectionName);
    const q = query(
      bookingsRef,
      where('status', '==', 'searching'),
      orderBy('createdAt', 'desc')
    );

    onSnapshot(q, async (snapshot) => {
      const jobs: JobData[] = [];

      for (const docSnap of snapshot.docs) {
        const jobData = {
          id: docSnap.id,
          ...docSnap.data(),
          bookingType: collectionName, // Add flag to identify the collection source
        } as JobData & { bookingType: string };

        // Check if worker has required skills for this job
        if (await this.workerHasRequiredSkills(jobData.categoryId)) {
          // Add client info
          if (jobData.clientId) {
            const clientData = await this.getClientData(jobData.clientId);
            jobData.clientName = clientData?.fullName;
            jobData.clientPhone = clientData?.phone;
          }

          // Calculate distance (simplified)
          jobData.distance = Math.round(Math.random() * 15 + 1);

          jobs.push(jobData);
        }
      }

      // Merge with existing jobs from the other collection
      const currentJobs = this.availableJobs$.value;
      const otherCollectionJobs = currentJobs.filter(
        (job) => (job as any).bookingType !== collectionName
      );
      const allJobs = [...otherCollectionJobs, ...jobs];

      this.availableJobs$.next(allJobs);
    });
  }

  private setupOngoingJobsListener() {
    if (!this.currentUserId) return;

    // Setup listeners for both regular bookings and quick bookings
    this.setupOngoingJobsTypeListener('bookings');
    this.setupOngoingJobsTypeListener('quickbookings');
  }

  private setupOngoingJobsTypeListener(collectionName: string) {
    if (!this.currentUserId) return;

    const bookingsRef = collection(this.firestore, collectionName);
    const q = query(
      bookingsRef,
      where('assignedWorker', '==', this.currentUserId),
      where('status', 'in', ['accepted', 'in_progress']),
      orderBy('createdAt', 'desc')
    );

    onSnapshot(q, async (snapshot) => {
      const jobs: JobData[] = [];

      for (const docSnap of snapshot.docs) {
        const jobData = {
          id: docSnap.id,
          ...docSnap.data(),
          bookingType: collectionName, // Add flag to identify the collection source
        } as JobData & { bookingType: string };

        // Add client info
        if (jobData.clientId) {
          const clientData = await this.getClientData(jobData.clientId);
          jobData.clientName = clientData?.fullName;
          jobData.clientPhone = clientData?.phone;
        }

        jobs.push(jobData);
      }

      // Merge with existing jobs from the other collection
      const currentJobs = this.ongoingJobs$.value;
      const otherCollectionJobs = currentJobs.filter(
        (job) => (job as any).bookingType !== collectionName
      );
      const allJobs = [...otherCollectionJobs, ...jobs];

      this.ongoingJobs$.next(allJobs);
    });
  }

  private async workerHasRequiredSkills(categoryId: string): Promise<boolean> {
    if (!this.currentUserId) return false;

    try {
      const workerRef = doc(this.firestore, `workers/${this.currentUserId}`);
      const workerSnap = await getDoc(workerRef);

      if (workerSnap.exists()) {
        const workerData = workerSnap.data();
        const skills = workerData?.['skills'] || [];

        // Get category data to check skill requirements
        const categoryRef = doc(
          this.firestore,
          `serviceCategories/${categoryId}`
        );
        const categorySnap = await getDoc(categoryRef);

        if (categorySnap.exists()) {
          const categoryData = categorySnap.data();
          const requiredSkill = categoryData?.['name']?.toLowerCase();

          return skills.some(
            (skill: string) =>
              skill.toLowerCase().includes(requiredSkill) ||
              requiredSkill.includes(skill.toLowerCase())
          );
        }
      }
      return false;
    } catch (error) {
      console.error('Error checking worker skills:', error);
      return true; // Default allow if error
    }
  }

  private async getClientData(clientId: string): Promise<any> {
    try {
      const clientRef = doc(this.firestore, `users/${clientId}`);
      const clientSnap = await getDoc(clientRef);
      return clientSnap.exists() ? clientSnap.data() : null;
    } catch (error) {
      console.error('Error getting client data:', error);
      return null;
    }
  }

  getAvailableJobs(): Observable<JobData[]> {
    return this.availableJobs$.asObservable();
  }

  getOngoingJobs(): Observable<JobData[]> {
    return this.ongoingJobs$.asObservable();
  }

  async acceptJob(bookingId: string, notificationId?: string): Promise<void> {
    if (!this.currentUserId) throw new Error('User not authenticated');

    try {
      // Determine which collection this booking is in
      const bookingType = await this.determineBookingType(bookingId);
      const collection = bookingType === 'quick' ? 'quickbookings' : 'bookings';

      // Update booking status and assign worker
      const bookingRef = doc(this.firestore, `${collection}/${bookingId}`);
      await updateDoc(bookingRef, {
        status: 'accepted',
        assignedWorker: this.currentUserId,
        acceptedAt: serverTimestamp(),
      });

      // Update worker's current job
      const workerRef = doc(this.firestore, `workers/${this.currentUserId}`);
      await updateDoc(workerRef, {
        currentJobId: bookingId,
        lastActiveAt: serverTimestamp(),
      });

      // Mark notification as read if provided
      if (notificationId) {
        await this.notificationService.markAsRead(notificationId);
      }

      // Create acceptance notification for client
      const bookingData = await this.getBookingData(bookingId, collection);
      if (bookingData?.clientId) {
        await this.createClientNotification(
          bookingData.clientId,
          'Worker Assigned',
          'A qualified worker has accepted your booking and will contact you soon.',
          bookingId
        );
      }

      console.log('Job accepted successfully');
    } catch (error) {
      console.error('Error accepting job:', error);
      throw error;
    }
  }

  async declineJob(notificationId: string): Promise<void> {
    try {
      // Mark notification as read
      await this.notificationService.markAsRead(notificationId);
      console.log('Job declined');
    } catch (error) {
      console.error('Error declining job:', error);
      throw error;
    }
  }

  async startJob(bookingId: string): Promise<void> {
    if (!this.currentUserId) throw new Error('User not authenticated');

    try {
      // Determine which collection this booking is in
      const bookingType = await this.determineBookingType(bookingId);
      const collection = bookingType === 'quick' ? 'quickbookings' : 'bookings';

      const bookingRef = doc(this.firestore, `${collection}/${bookingId}`);
      await updateDoc(bookingRef, {
        status: 'in_progress',
        startedAt: serverTimestamp(),
      });

      // Notify client
      const bookingData = await this.getBookingData(bookingId);
      if (bookingData?.clientId) {
        await this.createClientNotification(
          bookingData.clientId,
          'Service Started',
          'Your worker has started working on your service request.',
          bookingId
        );
      }

      console.log('Job started successfully');
    } catch (error) {
      console.error('Error starting job:', error);
      throw error;
    }
  }

  async completeJob(bookingId: string): Promise<void> {
    if (!this.currentUserId) throw new Error('User not authenticated');

    try {
      // Determine which collection this booking is in
      const bookingType = await this.determineBookingType(bookingId);
      const collection = bookingType === 'quick' ? 'quickbookings' : 'bookings';

      const bookingRef = doc(this.firestore, `${collection}/${bookingId}`);
      await updateDoc(bookingRef, {
        status: 'completed',
        completedAt: serverTimestamp(),
      });

      // Update worker stats
      const workerRef = doc(this.firestore, `workers/${this.currentUserId}`);
      const workerSnap = await getDoc(workerRef);

      if (workerSnap.exists()) {
        const workerData = workerSnap.data();
        const currentJobsCompleted = workerData?.['jobsCompleted'] || 0;
        const currentEarnings = workerData?.['monthlyEarnings'] || 0;

        // Get job payout amount
        const bookingData = await this.getBookingData(bookingId);
        const payout = bookingData
          ? bookingData.pricing.basePrice -
            bookingData.pricing.serviceCharge +
            bookingData.pricing.transportFee
          : 0;

        await updateDoc(workerRef, {
          jobsCompleted: currentJobsCompleted + 1,
          monthlyEarnings: currentEarnings + payout,
          currentJobId: null,
          lastActiveAt: serverTimestamp(),
        });
      }

      // Notify client
      const bookingData = await this.getBookingData(bookingId);
      if (bookingData?.clientId) {
        await this.createClientNotification(
          bookingData.clientId,
          'Service Completed',
          'Your service has been completed. Please rate your worker.',
          bookingId
        );
      }

      console.log('Job completed successfully');
    } catch (error) {
      console.error('Error completing job:', error);
      throw error;
    }
  }

  private async getBookingData(
    bookingId: string,
    collection?: string
  ): Promise<any> {
    try {
      if (collection) {
        // Use specified collection
        const bookingRef = doc(this.firestore, `${collection}/${bookingId}`);
        const bookingSnap = await getDoc(bookingRef);
        return bookingSnap.exists()
          ? { id: bookingSnap.id, ...bookingSnap.data() }
          : null;
      } else {
        // Auto-determine collection
        const bookingType = await this.determineBookingType(bookingId);
        const collectionName =
          bookingType === 'quick' ? 'quickbookings' : 'bookings';
        const bookingRef = doc(
          this.firestore,
          `${collectionName}/${bookingId}`
        );
        const bookingSnap = await getDoc(bookingRef);
        return bookingSnap.exists()
          ? { id: bookingSnap.id, ...bookingSnap.data() }
          : null;
      }
    } catch (error) {
      console.error('Error getting booking data:', error);
      return null;
    }
  }

  private async determineBookingType(
    bookingId: string
  ): Promise<'quick' | 'regular'> {
    try {
      // Check quickbookings collection first
      const quickBookingRef = doc(this.firestore, `quickbookings/${bookingId}`);
      const quickBookingSnap = await getDoc(quickBookingRef);

      if (quickBookingSnap.exists()) {
        return 'quick';
      }

      // Check regular bookings collection
      const regularBookingRef = doc(this.firestore, `bookings/${bookingId}`);
      const regularBookingSnap = await getDoc(regularBookingRef);

      if (regularBookingSnap.exists()) {
        return 'regular';
      }

      // Default to regular if not found
      return 'regular';
    } catch (error) {
      console.error('Error determining booking type:', error);
      return 'regular';
    }
  }

  private async createClientNotification(
    clientId: string,
    title: string,
    message: string,
    bookingId: string
  ): Promise<void> {
    try {
      const notificationRef = collection(
        this.firestore,
        `users/${clientId}/notifications`
      );
      await addDoc(notificationRef, {
        title,
        message,
        bookingId,
        read: false,
        type: 'booking_update',
        createdAt: serverTimestamp(),
      });
    } catch (error) {
      console.error('Error creating client notification:', error);
    }
  }

  async refreshJobs(): Promise<void> {
    // Refresh is handled automatically by real-time listeners
    console.log('Jobs refreshed');
  }
}
