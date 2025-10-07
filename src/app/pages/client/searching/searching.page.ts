import { Component, OnInit, OnDestroy } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import {
  Firestore,
  doc,
  onSnapshot,
  getDoc,
  Unsubscribe,
} from '@angular/fire/firestore';
import { ToastController, AlertController } from '@ionic/angular';

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
  status:
    | 'searching'
    | 'accepted'
    | 'in_progress'
    | 'completed'
    | 'cancelled'
    | 'no_workers_available';
  assignedWorker?: string;
  createdAt: any;
  searchStartedAt?: any;
}

interface WorkerData {
  uid: string;
  fullName: string;
  profilePhotoUrl?: string;
  profilePhotoData?: string; // Base64 image data
  rating: number;
  skills: string[];
  location: {
    lat: number;
    lng: number;
  };
  phone?: string;
}

@Component({
  selector: 'app-searching',
  templateUrl: './searching.page.html',
  styleUrls: ['./searching.page.scss'],
  standalone: false,
})
export class SearchingPage implements OnInit, OnDestroy {
  bookingId: string = '';
  bookingData: BookingData | null = null;
  assignedWorker: WorkerData | null = null;
  isQuickBooking: boolean = false;

  // UI State
  searchProgress: string = 'Looking for nearby professionals...';
  searchRadius: number = 3; // km
  timeElapsed: number = 0;
  isSearching: boolean = true;

  // For template access
  Math = Math;

  // Animation states
  animationText: string[] = [
    'Searching for available workers...',
    'Checking nearby professionals...',
    'Expanding search area...',
    'Finding the best match for you...',
  ];
  currentAnimationIndex: number = 0;

  private bookingListener?: Unsubscribe;
  private searchTimer?: any;
  private animationTimer?: any;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private firestore: Firestore,
    private toastController: ToastController,
    private alertController: AlertController
  ) {}

  ngOnInit() {
    this.bookingId = this.route.snapshot.paramMap.get('bookingId') || '';
    if (this.bookingId) {
      this.startBookingListener();
      this.startSearchTimer();
      this.startAnimationCycle();
    } else {
      this.router.navigate(['/client/dashboard']);
    }
  }

  ngOnDestroy() {
    this.cleanup();
  }

  private cleanup() {
    if (this.bookingListener) {
      this.bookingListener();
    }
    if (this.searchTimer) {
      clearInterval(this.searchTimer);
    }
    if (this.animationTimer) {
      clearInterval(this.animationTimer);
    }
  }

  private async startBookingListener() {
    // First, determine if this is a quick booking or regular booking
    await this.determineBookingType();

    const collection = this.isQuickBooking ? 'quickbookings' : 'bookings';
    const bookingRef = doc(this.firestore, `${collection}/${this.bookingId}`);

    this.bookingListener = onSnapshot(bookingRef, async (doc) => {
      if (doc.exists()) {
        this.bookingData = { id: doc.id, ...doc.data() } as BookingData;

        // Handle status changes
        switch (this.bookingData.status) {
          case 'accepted':
            await this.handleWorkerAccepted();
            break;
          case 'no_workers_available':
            await this.handleNoWorkersAvailable();
            break;
          case 'cancelled':
            await this.handleBookingCancelled();
            break;
        }
      } else {
        // Booking doesn't exist, redirect to dashboard
        this.router.navigate(['/client/dashboard']);
        this.showToast('Booking not found', 'danger');
      }
    });
  }

  private async determineBookingType(): Promise<void> {
    try {
      // Check quickbookings collection first
      const quickBookingRef = doc(
        this.firestore,
        `quickbookings/${this.bookingId}`
      );
      const quickBookingSnap = await getDoc(quickBookingRef);

      if (quickBookingSnap.exists()) {
        this.isQuickBooking = true;
        return;
      }

      // Check regular bookings collection
      const regularBookingRef = doc(
        this.firestore,
        `bookings/${this.bookingId}`
      );
      const regularBookingSnap = await getDoc(regularBookingRef);

      if (regularBookingSnap.exists()) {
        this.isQuickBooking = false;
        return;
      }

      // If neither exists, redirect to dashboard
      this.router.navigate(['/client/dashboard']);
      this.showToast('Booking not found', 'danger');
    } catch (error) {
      console.error('Error determining booking type:', error);
      this.router.navigate(['/client/dashboard']);
      this.showToast('Error loading booking', 'danger');
    }
  }

  private startSearchTimer() {
    this.searchTimer = setInterval(() => {
      this.timeElapsed++;

      // Update search radius and progress text based on time elapsed
      if (this.timeElapsed === 15) {
        this.searchRadius = 5;
        this.searchProgress = 'Expanding search to 5km radius...';
      } else if (this.timeElapsed === 30) {
        this.searchRadius = 8;
        this.searchProgress = 'Searching in wider area (8km)...';
      } else if (this.timeElapsed === 45) {
        this.searchRadius = 15;
        this.searchProgress = 'Looking for workers in extended area...';
      } else if (this.timeElapsed >= 60) {
        // After 60 seconds, show timeout option
        this.handleSearchTimeout();
      }
    }, 1000);
  }

  private startAnimationCycle() {
    this.animationTimer = setInterval(() => {
      this.currentAnimationIndex =
        (this.currentAnimationIndex + 1) % this.animationText.length;
    }, 3000);
  }

  private async handleWorkerAccepted() {
    this.isSearching = false;
    this.cleanup();

    if (this.bookingData?.assignedWorker) {
      // Load worker data and navigate to worker found page
      await this.showToast('Worker found! Redirecting...', 'success');
      setTimeout(() => {
        this.router.navigate(['/client/worker-found', this.bookingId]);
      }, 1500);
    }
  }

  private async handleNoWorkersAvailable() {
    this.isSearching = false;
    this.cleanup();

    const alert = await this.alertController.create({
      header: 'No Workers Available',
      message:
        'Sorry, no workers are available for your request right now. Would you like to try again later?',
      buttons: [
        {
          text: 'Try Again',
          handler: () => {
            this.retrySearch();
          },
        },
        {
          text: 'Cancel Booking',
          role: 'destructive',
          handler: () => {
            this.cancelBooking();
          },
        },
      ],
    });

    await alert.present();
  }

  private async handleBookingCancelled() {
    this.cleanup();
    await this.showToast('Booking has been cancelled', 'medium');
    this.router.navigate(['/client/dashboard']);
  }

  private async handleSearchTimeout() {
    if (!this.isSearching) return;

    const alert = await this.alertController.create({
      header: 'Still Searching',
      message:
        "We're having trouble finding available workers. Would you like to continue waiting or try again later?",
      buttons: [
        {
          text: 'Keep Waiting',
          handler: () => {
            // Continue searching
            this.timeElapsed = 0;
          },
        },
        {
          text: 'Try Later',
          handler: () => {
            this.cancelBooking();
          },
        },
      ],
    });

    await alert.present();
  }

  private async retrySearch() {
    // Reset search state
    this.timeElapsed = 0;
    this.searchRadius = 3;
    this.isSearching = true;
    this.searchProgress = 'Looking for nearby professionals...';
    this.currentAnimationIndex = 0;

    // Restart timers
    this.startSearchTimer();

    // TODO: Trigger worker matching service again
    await this.showToast('Restarting search...', 'primary');
  }

  async cancelBooking() {
    const alert = await this.alertController.create({
      header: 'Cancel Booking',
      message: 'Are you sure you want to cancel this booking?',
      buttons: [
        {
          text: 'No, Keep Searching',
          role: 'cancel',
        },
        {
          text: 'Yes, Cancel',
          role: 'destructive',
          handler: async () => {
            try {
              // Update booking status to cancelled
              const bookingRef = doc(
                this.firestore,
                `bookings/${this.bookingId}`
              );
              // TODO: Update booking status to cancelled in Firestore

              this.cleanup();
              await this.showToast('Booking cancelled', 'medium');
              this.router.navigate(['/client/dashboard']);
            } catch (error) {
              console.error('Error cancelling booking:', error);
              await this.showToast('Error cancelling booking', 'danger');
            }
          },
        },
      ],
    });

    await alert.present();
  }

  getTimeElapsedText(): string {
    const minutes = Math.floor(this.timeElapsed / 60);
    const seconds = this.timeElapsed % 60;

    if (minutes > 0) {
      return `${minutes}m ${seconds}s`;
    }
    return `${seconds}s`;
  }

  getSearchRadiusText(): string {
    return `${this.searchRadius}km radius`;
  }

  private async showToast(
    message: string,
    color: 'success' | 'danger' | 'warning' | 'primary' | 'medium'
  ) {
    const toast = await this.toastController.create({
      message,
      duration: 3000,
      color,
      position: 'bottom',
    });
    await toast.present();
  }
}
