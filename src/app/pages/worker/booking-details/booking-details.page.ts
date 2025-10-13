import { Component, OnInit, OnDestroy } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import {
  Firestore,
  doc,
  getDoc,
  updateDoc,
  onSnapshot,
  Timestamp,
} from '@angular/fire/firestore';
import { ToastController, AlertController } from '@ionic/angular';
import { AuthService, UserProfile } from '../../../services/auth.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-booking-details',
  templateUrl: './booking-details.page.html',
  styleUrls: ['./booking-details.page.scss'],
  standalone: false,
})
export class BookingDetailsPage implements OnInit, OnDestroy {
  bookingId: string = '';
  booking: any = null;
  userProfile: UserProfile | null = null;
  isLoading: boolean = true;

  private subscriptions: Subscription[] = [];

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private firestore: Firestore,
    private toastController: ToastController,
    private alertController: AlertController,
    private authService: AuthService
  ) {}

  ngOnInit() {
    // Get booking ID from query params
    this.route.queryParams.subscribe((params) => {
      this.bookingId = params['bookingId'];
      if (this.bookingId) {
        this.loadBookingDetails();
      }
    });

    // Get user profile
    this.subscriptions.push(
      this.authService.userProfile$.subscribe((profile) => {
        this.userProfile = profile;
      })
    );
  }

  ngOnDestroy() {
    this.subscriptions.forEach((sub) => sub.unsubscribe());
  }

  async loadBookingDetails() {
    if (!this.bookingId) return;

    try {
      const bookingRef = doc(this.firestore, 'quickbookings', this.bookingId);

      // Set up real-time listener
      const unsubscribe = onSnapshot(bookingRef, (doc) => {
        if (doc.exists()) {
          this.booking = {
            id: doc.id,
            ...doc.data(),
          };
        } else {
          this.showToast('Booking not found', 'danger');
          this.router.navigate(['/pages/worker/dashboard']);
        }
        this.isLoading = false;
      });

      this.subscriptions.push({ unsubscribe } as any);
    } catch (error) {
      console.error('Error loading booking details:', error);
      this.showToast('Error loading booking details', 'danger');
      this.isLoading = false;
    }
  }

  async updateBookingStatus(status: string) {
    try {
      const bookingRef = doc(this.firestore, 'quickbookings', this.bookingId);
      await updateDoc(bookingRef, {
        status: status,
        updatedAt: Timestamp.now(),
      });

      this.showToast(`Booking status updated to ${status}`, 'success');
    } catch (error) {
      console.error('Error updating booking status:', error);
      this.showToast('Error updating booking status', 'danger');
    }
  }

  openDirections() {
    if (!this.booking?.location) {
      this.showToast('Location not available', 'danger');
      return;
    }

    const { lat, lng } = this.booking.location;

    // Open Google Maps with directions
    const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`;
    window.open(directionsUrl, '_system');
  }

  async confirmOnTheWay() {
    const alert = await this.alertController.create({
      header: 'Confirm',
      message: 'Are you on your way to the client?',
      buttons: [
        {
          text: 'Cancel',
          role: 'cancel',
        },
        {
          text: 'Yes, On My Way',
          handler: () => {
            this.updateBookingStatus('on-the-way');
          },
        },
      ],
    });

    await alert.present();
  }

  async confirmArrived() {
    const alert = await this.alertController.create({
      header: 'Confirm',
      message: 'Have you arrived at the client location?',
      buttons: [
        {
          text: 'Cancel',
          role: 'cancel',
        },
        {
          text: "Yes, I've Arrived",
          handler: () => {
            this.updateBookingStatus('in-progress');
          },
        },
      ],
    });

    await alert.present();
  }

  async confirmCompleted() {
    const alert = await this.alertController.create({
      header: 'Confirm',
      message: 'Have you completed the service?',
      buttons: [
        {
          text: 'Cancel',
          role: 'cancel',
        },
        {
          text: 'Yes, Completed',
          handler: () => {
            this.updateBookingStatus('completed');
          },
        },
      ],
    });

    await alert.present();
  }

  async showToast(message: string, color: 'success' | 'danger' | 'medium') {
    const toast = await this.toastController.create({
      message,
      duration: 3000,
      color,
      position: 'bottom',
    });
    await toast.present();
  }

  goBack() {
    this.router.navigate(['/pages/worker/dashboard']);
  }

  getStatusIcon(status: string): string {
    switch (status) {
      case 'accepted':
        return 'checkmark-circle';
      case 'on-the-way':
        return 'car';
      case 'in-progress':
        return 'build';
      case 'completed':
        return 'trophy';
      default:
        return 'help-circle';
    }
  }

  getStatusText(status: string): string {
    switch (status) {
      case 'accepted':
        return 'Booking Accepted';
      case 'on-the-way':
        return 'On The Way';
      case 'in-progress':
        return 'Service In Progress';
      case 'completed':
        return 'Service Completed';
      default:
        return 'Unknown Status';
    }
  }
}
