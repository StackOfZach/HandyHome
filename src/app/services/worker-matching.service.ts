import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  collection,
  query,
  where,
  getDocs,
  addDoc,
  updateDoc,
  doc,
  serverTimestamp,
  Timestamp,
} from '@angular/fire/firestore';

interface WorkerProfile {
  uid: string;
  fullName: string;
  profilePhotoUrl?: string;
  profilePhotoData?: string; // Base64 image data from workers collection
  skills: string[];
  verificationStatus: 'pending' | 'verified' | 'rejected';
  availability: 'online' | 'offline' | 'busy';
  location: {
    lat: number;
    lng: number;
  };
  rating: number;
  workRadius: number; // in km
  lastActiveAt: any;
}

interface BookingData {
  id: string;
  clientId: string;
  categoryId: string;
  categoryName: string;
  subService: string;
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
  status: string;
  createdAt: any;
  // quick | regular booking origin; optional for backward compatibility
  bookingType?: 'quick' | 'regular';
}

@Injectable({
  providedIn: 'root',
})
export class WorkerMatchingService {
  private firestore = inject(Firestore);

  constructor() {}

  /**
   * Main function to find and notify workers for a booking
   */
  async findAndNotifyWorkers(bookingData: BookingData): Promise<void> {
    console.log('Starting worker search for booking:', bookingData.id);

    try {
      // Start with 3km radius and expand if needed
      let searchRadius = 3;
      let workersFound = false;

      while (!workersFound && searchRadius <= 15) {
        console.log(`Searching for workers within ${searchRadius}km`);

        const qualifiedWorkers = await this.findQualifiedWorkers(
          bookingData.categoryName,
          bookingData.subService,
          bookingData.location,
          searchRadius
        );

        if (qualifiedWorkers.length > 0) {
          console.log(`Found ${qualifiedWorkers.length} qualified workers`);

          // Send notifications to all qualified workers
          await this.sendNotificationsToWorkers(qualifiedWorkers, bookingData);
          workersFound = true;

          // Set a timeout to mark booking as no_workers_available if no one accepts
          this.setBookingTimeout(bookingData.id);
        } else {
          console.log(
            `No workers found within ${searchRadius}km, expanding search...`
          );
          searchRadius += 2; // Expand by 2km each time

          // Wait a bit before expanding search
          await new Promise((resolve) => setTimeout(resolve, 5000));
        }
      }

      if (!workersFound) {
        console.log(
          'No workers found in any radius, marking as no_workers_available'
        );
        await this.markBookingAsNoWorkersAvailable(bookingData.id);
      }
    } catch (error) {
      console.error('Error in worker matching process:', error);
      await this.markBookingAsNoWorkersAvailable(bookingData.id);
    }
  }

  /**
   * Query Firestore for qualified workers
   */
  private async findQualifiedWorkers(
    categoryName: string,
    subService: string,
    clientLocation: { lat: number; lng: number },
    searchRadius: number
  ): Promise<WorkerProfile[]> {
    try {
      const workersRef = collection(this.firestore, 'workers');

      // Query for verified, online workers
      const q = query(
        workersRef,
        where('verificationStatus', '==', 'verified'),
        where('availability', '==', 'online')
      );

      const querySnapshot = await getDocs(q);
      const qualifiedWorkers: WorkerProfile[] = [];

      querySnapshot.forEach((doc) => {
        const workerData = { uid: doc.id, ...doc.data() } as WorkerProfile;

        // Check if worker has required skills
        if (this.workerHasRequiredSkill(workerData, categoryName, subService)) {
          // Check if worker is within search radius
          const distance = this.calculateDistance(
            clientLocation.lat,
            clientLocation.lng,
            workerData.location.lat,
            workerData.location.lng
          );

          if (distance <= searchRadius) {
            console.log(
              `Qualified worker found: ${
                workerData.fullName
              } (${distance.toFixed(1)}km away)`
            );
            qualifiedWorkers.push(workerData);
          }
        }
      });

      return qualifiedWorkers;
    } catch (error) {
      console.error('Error querying workers:', error);
      return [];
    }
  }

  /**
   * Check if worker has required skills for the job
   */
  private workerHasRequiredSkill(
    worker: WorkerProfile,
    categoryName: string,
    subService: string
  ): boolean {
    const workerSkills = worker.skills.map((skill) => skill.toLowerCase());
    const requiredCategory = categoryName.toLowerCase();
    const requiredSubService = subService.toLowerCase();

    // Check if any of the worker's skills match the category or sub-service
    return workerSkills.some(
      (skill) =>
        skill.includes(requiredCategory) ||
        requiredCategory.includes(skill) ||
        skill.includes(requiredSubService) ||
        requiredSubService.includes(skill)
    );
  }

  /**
   * Calculate distance between two coordinates using Haversine formula
   */
  private calculateDistance(
    lat1: number,
    lng1: number,
    lat2: number,
    lng2: number
  ): number {
    const R = 6371; // Earth's radius in km
    const dLat = this.deg2rad(lat2 - lat1);
    const dLng = this.deg2rad(lng2 - lng1);

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.deg2rad(lat1)) *
        Math.cos(this.deg2rad(lat2)) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; // Distance in km
  }

  private deg2rad(deg: number): number {
    return deg * (Math.PI / 180);
  }

  /**
   * Send notifications to qualified workers
   */
  private async sendNotificationsToWorkers(
    workers: WorkerProfile[],
    bookingData: BookingData
  ): Promise<void> {
    const notificationPromises = workers.map((worker) =>
      this.createWorkerNotification(worker.uid, bookingData)
    );

    try {
      await Promise.all(notificationPromises);
      console.log(`Notifications sent to ${workers.length} workers`);
    } catch (error) {
      console.error('Error sending notifications:', error);
    }
  }

  /**
   * Create notification for a specific worker
   */
  private async createWorkerNotification(
    workerId: string,
    bookingData: BookingData
  ): Promise<void> {
    try {
      const notificationRef = collection(
        this.firestore,
        `workers/${workerId}/notifications`
      );

      // Set expiration time (90 seconds from now for worker response)
      const expiresAt = new Date();
      expiresAt.setSeconds(expiresAt.getSeconds() + 90);

      await addDoc(notificationRef, {
        title: `New ${bookingData.categoryName} Request`,
        message: `A client nearby requested ${bookingData.subService}. Tap to view details.`,
        bookingId: bookingData.id,
        categoryId: bookingData.categoryId,
        categoryName: bookingData.categoryName,
        clientLocation: bookingData.location.address,
        estimatedEarnings:
          bookingData.pricing.basePrice -
          bookingData.pricing.serviceCharge +
          bookingData.pricing.transportFee,
        read: false,
        priority: 'urgent',
        type: 'job_request',
        createdAt: serverTimestamp(),
        expiresAt: Timestamp.fromDate(expiresAt),
        // include origin to aid routing on click
        bookingType: bookingData.bookingType || 'regular',
      });

      console.log(`Notification created for worker: ${workerId}`);
    } catch (error) {
      console.error(
        `Error creating notification for worker ${workerId}:`,
        error
      );
    }
  }

  /**
   * Set a timeout to mark booking as no workers available if no one accepts
   */
  private setBookingTimeout(bookingId: string): void {
    // After 2 minutes, if no worker has accepted, mark as no_workers_available
    setTimeout(async () => {
      try {
        // Check if booking is still in 'searching' status
        const bookingRef = doc(this.firestore, `bookings/${bookingId}`);
        const bookingDoc = await getDocs(
          query(
            collection(this.firestore, 'bookings'),
            where('__name__', '==', bookingId)
          )
        );

        if (!bookingDoc.empty) {
          const bookingData = bookingDoc.docs[0].data();
          if (bookingData?.['status'] === 'searching') {
            await this.markBookingAsNoWorkersAvailable(bookingId);
          }
        }
      } catch (error) {
        console.error('Error in booking timeout:', error);
      }
    }, 120000); // 2 minutes
  }

  /**
   * Mark booking as no workers available
   */
  private async markBookingAsNoWorkersAvailable(
    bookingId: string
  ): Promise<void> {
    try {
      const bookingRef = doc(this.firestore, `bookings/${bookingId}`);
      await updateDoc(bookingRef, {
        status: 'no_workers_available',
        updatedAt: serverTimestamp(),
      });

      console.log(`Booking ${bookingId} marked as no_workers_available`);
    } catch (error) {
      console.error('Error marking booking as no workers available:', error);
    }
  }

  /**
   * Handle worker accepting a job
   */
  async acceptJob(workerId: string, bookingId: string): Promise<void> {
    try {
      // Update booking with assigned worker
      const bookingRef = doc(this.firestore, `bookings/${bookingId}`);
      await updateDoc(bookingRef, {
        assignedWorker: workerId,
        status: 'accepted',
        acceptedAt: serverTimestamp(),
      });

      // Update worker with current job
      const workerRef = doc(this.firestore, `workers/${workerId}`);
      await updateDoc(workerRef, {
        currentJobId: bookingId,
        availability: 'busy',
        lastActiveAt: serverTimestamp(),
      });

      // Mark all other notifications for this booking as expired
      await this.expireOtherNotifications(bookingId, workerId);

      // Create client notification about worker assignment
      await this.notifyClientWorkerAssigned(bookingId, workerId);

      console.log(`Job ${bookingId} accepted by worker ${workerId}`);
    } catch (error) {
      console.error('Error accepting job:', error);
      throw error;
    }
  }

  /**
   * Expire notifications for other workers when one accepts
   */
  private async expireOtherNotifications(
    bookingId: string,
    acceptedWorkerId: string
  ): Promise<void> {
    try {
      // This would require a cloud function in production to efficiently update all notifications
      // For now, we'll just log it
      console.log(
        `Should expire notifications for booking ${bookingId}, worker ${acceptedWorkerId} accepted`
      );
    } catch (error) {
      console.error('Error expiring notifications:', error);
    }
  }

  /**
   * Notify client that a worker has been assigned
   */
  private async notifyClientWorkerAssigned(
    bookingId: string,
    workerId: string
  ): Promise<void> {
    try {
      // Get booking data to find client
      const bookingRef = doc(this.firestore, `bookings/${bookingId}`);
      const bookingDoc = await getDocs(
        query(
          collection(this.firestore, 'bookings'),
          where('__name__', '==', bookingId)
        )
      );

      if (!bookingDoc.empty) {
        const bookingData = bookingDoc.docs[0].data();
        const clientId = bookingData?.['clientId'];

        if (clientId) {
          const notificationRef = collection(
            this.firestore,
            `users/${clientId}/notifications`
          );
          await addDoc(notificationRef, {
            title: 'Worker Found!',
            message:
              'A qualified worker has accepted your booking and will contact you soon.',
            bookingId: bookingId,
            workerId: workerId,
            read: false,
            type: 'worker_assigned',
            createdAt: serverTimestamp(),
          });
        }
      }
    } catch (error) {
      console.error('Error notifying client:', error);
    }
  }
}
