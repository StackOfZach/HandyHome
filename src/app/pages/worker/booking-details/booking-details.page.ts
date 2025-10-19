import { Component, OnInit, OnDestroy } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import {
  Firestore,
  doc,
  getDoc,
  updateDoc,
  onSnapshot,
  Timestamp,
  serverTimestamp,
} from '@angular/fire/firestore';
import { ToastController, AlertController } from '@ionic/angular';
import { AuthService, UserProfile } from '../../../services/auth.service';
import { Subscription, interval } from 'rxjs';
import { Geolocation } from '@capacitor/geolocation';
import { BookingData } from '../../../services/booking.service';

@Component({
  selector: 'app-booking-details',
  templateUrl: './booking-details.page.html',
  styleUrls: ['./booking-details.page.scss'],
  standalone: false,
})
export class BookingDetailsPage implements OnInit, OnDestroy {
  bookingId: string = '';
  booking: any = null; // Using any for now since it handles both BookingData and QuickBookingData
  userProfile: UserProfile | null = null;
  isLoading: boolean = true;
  jobAmount: number = 0;
  isLocationTracking: boolean = false;
  workerLocation: { lat: number; lng: number } | null = null;
  isWithinRadius: boolean = false;
  
  // Job control states
  isJobStarted: boolean = false;
  isJobCompleted: boolean = false;
  isPaymentRequested: boolean = false;

  private subscriptions: Subscription[] = [];
  private locationSubscription?: Subscription;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private firestore: Firestore,
    private toastController: ToastController,
    private alertController: AlertController,
    private authService: AuthService
  ) {}

  ngOnInit() {
    // Get booking ID from route params (not query params)
    this.route.params.subscribe((params) => {
      this.bookingId = params['id'];
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

  async loadBookingDetails() {
    if (!this.bookingId) return;

    try {
      const bookingRef = doc(this.firestore, 'bookings', this.bookingId);

      // Set up real-time listener
      const unsubscribe = onSnapshot(bookingRef, (doc) => {
        if (doc.exists()) {
          this.booking = {
            id: doc.id,
            ...doc.data(),
          };
          console.log('Booking loaded:', this.booking);
        } else {
          console.log('Booking not found in bookings collection');
          this.showToast('Booking not found', 'danger');
          this.router.navigate(['/pages/worker/dashboard']);
        }
        this.isLoading = false;
      }, (error) => {
        console.error('Error listening to booking:', error);
        this.showToast('Error loading booking details', 'danger');
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
      const bookingRef = doc(this.firestore, 'bookings', this.bookingId);
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
    let lat, lng;
    
    // Handle different location formats
    if (this.booking?.location) {
      ({ lat, lng } = this.booking.location);
    } else if (this.booking?.locations && this.booking.locations.length > 0) {
      const location = this.booking.locations[0];
      if (location.coordinates) {
        lat = location.coordinates.latitude;
        lng = location.coordinates.longitude;
      }
    }
    
    if (!lat || !lng) {
      this.showToast('Location not available', 'danger');
      return;
    }

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

  getStatusDisplay(): string {
    if (!this.booking?.status) return 'UNKNOWN';
    
    switch (this.booking.status) {
      case 'pending':
        return 'PENDING';
      case 'accepted':
        return 'ACCEPTED';
      case 'on-the-way':
        return 'ON THE WAY';
      case 'in-progress':
        return 'IN PROGRESS';
      case 'completed':
        return 'COMPLETED';
      default:
        return 'UNKNOWN';
    }
  }

  // SMS Messaging Feature
  async sendClientMessage() {
    if (!this.userProfile?.fullName || !this.booking) {
      this.showToast('Unable to send message', 'danger');
      return;
    }

    const scheduleDate = this.booking.scheduleDate || this.booking.date || new Date();
    const formattedDate = new Date(scheduleDate).toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    const message = `Hi! I am ${this.userProfile.fullName}, your HandyHome worker. I have accepted your job and will see you on ${formattedDate}. Thank you for choosing HandyHome!`;
    
    // Get client phone number
    const clientPhone = this.booking.clientPhone || this.booking.customerPhone || '';
    
    if (!clientPhone) {
      this.showToast('Client phone number not available', 'medium');
      return;
    }

    // Open SMS app with pre-filled message
    const smsUrl = `sms:${clientPhone}?body=${encodeURIComponent(message)}`;
    window.open(smsUrl, '_system');
  }

  // Location Tracking
  async startLocationTracking() {
    if (this.isLocationTracking) return;

    try {
      // Request permission first
      const permission = await Geolocation.requestPermissions();
      if (permission.location !== 'granted') {
        this.showToast('Location permission required for tracking', 'medium');
        return;
      }

      this.isLocationTracking = true;
      
      // Update location every 10 seconds
      this.locationSubscription = interval(10000).subscribe(async () => {
        await this.updateWorkerLocation();
      });

      // Initial location update
      await this.updateWorkerLocation();
      
      this.showToast('Location tracking started', 'success');
    } catch (error) {
      console.error('Error starting location tracking:', error);
      this.showToast('Error starting location tracking', 'danger');
    }
  }

  async updateWorkerLocation() {
    try {
      const position = await Geolocation.getCurrentPosition();
      const lat = position.coords.latitude;
      const lng = position.coords.longitude;

      this.workerLocation = { lat, lng };

      // Update Firestore with worker location
      if (this.bookingId) {
        await updateDoc(doc(this.firestore, 'bookings', this.bookingId), {
          workerLocation: {
            latitude: lat,
            longitude: lng,
            timestamp: serverTimestamp()
          },
          updatedAt: serverTimestamp()
        });
      }

      // Check proximity to client
      this.checkProximity();
    } catch (error) {
      console.error('Error updating location:', error);
    }
  }

  checkProximity() {
    if (!this.workerLocation || !this.booking) return;

    let clientLat, clientLng;
    
    // Get client location
    if (this.booking.location) {
      clientLat = this.booking.location.lat;
      clientLng = this.booking.location.lng;
    } else if (this.booking.locations && this.booking.locations.length > 0) {
      const location = this.booking.locations[0];
      if (location.coordinates) {
        clientLat = location.coordinates.latitude;
        clientLng = location.coordinates.longitude;
      }
    }

    if (!clientLat || !clientLng) return;

    // Calculate distance using Haversine formula
    const distance = this.calculateDistance(
      this.workerLocation.lat,
      this.workerLocation.lng,
      clientLat,
      clientLng
    );

    // Check if within 100m radius
    const wasWithinRadius = this.isWithinRadius;
    this.isWithinRadius = distance <= 0.1; // 0.1 km = 100m

    // If just arrived within radius, update status
    if (this.isWithinRadius && !wasWithinRadius) {
      this.updateBookingStatus('worker-arrived');
      this.showToast('You have arrived at the client location!', 'success');
    }
  }

  calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371; // Earth's radius in kilometers
    const dLat = this.toRadians(lat2 - lat1);
    const dLng = this.toRadians(lng2 - lng1);
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(this.toRadians(lat1)) * Math.cos(this.toRadians(lat2)) * 
      Math.sin(dLng/2) * Math.sin(dLng/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  }

  toRadians(degrees: number): number {
    return degrees * (Math.PI/180);
  }

  // Job Control Methods
  async startJob() {
    const alert = await this.alertController.create({
      header: 'Start Job',
      message: 'Are you ready to start working on this job?',
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Start Job',
          handler: async () => {
            await this.updateBookingStatus('in-progress');
            this.isJobStarted = true;
            this.showToast('Job started successfully!', 'success');
          }
        }
      ]
    });
    await alert.present();
  }

  async completeJob() {
    if (!this.booking) return;

    const alert = await this.alertController.create({
      header: 'Complete Job',
      message: 'Enter the amount to charge the client (within budget range)',
      inputs: [
        {
          name: 'amount',
          type: 'number',
          placeholder: `Amount (₱${this.booking.minBudget || 0} - ₱${this.booking.maxBudget || this.booking.priceRange || 0})`,
          min: this.booking.minBudget || 0,
          max: this.booking.maxBudget || this.booking.priceRange || 999999
        }
      ],
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Complete Job',
          handler: async (data) => {
            const amount = parseFloat(data.amount);
            const minBudget = this.booking.minBudget || 0;
            const maxBudget = this.booking.maxBudget || this.booking.priceRange || 999999;

            if (amount < minBudget || amount > maxBudget) {
              this.showToast(`Amount must be between ₱${minBudget} and ₱${maxBudget}`, 'medium');
              return false;
            }

            this.jobAmount = amount;
            await this.updateBookingStatus('completed');
            await this.requestPayment(amount);
            this.isJobCompleted = true;
            return true;
          }
        }
      ]
    });
    await alert.present();
  }

  async requestPayment(amount: number) {
    try {
      await updateDoc(doc(this.firestore, 'bookings', this.bookingId), {
        finalAmount: amount,
        paymentStatus: 'requested',
        completedAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      this.isPaymentRequested = true;
      this.showToast('Payment request sent to client', 'success');
    } catch (error) {
      console.error('Error requesting payment:', error);
      this.showToast('Error requesting payment', 'danger');
    }
  }

  async confirmPaymentReceived() {
    const alert = await this.alertController.create({
      header: 'Confirm Payment',
      message: 'Have you received the payment from the client?',
      buttons: [
        { text: 'Not Yet', role: 'cancel' },
        {
          text: 'Yes, Received',
          handler: async () => {
            await updateDoc(doc(this.firestore, 'bookings', this.bookingId), {
              paymentStatus: 'completed',
              paymentConfirmedAt: serverTimestamp(),
              updatedAt: serverTimestamp()
            });
            
            this.showToast('Payment confirmed! Job completed successfully.', 'success');
            this.router.navigate(['/pages/worker/dashboard']);
          }
        }
      ]
    });
    await alert.present();
  }

  // Google Maps Directions Feature
  async openGoogleMapsDirections() {
    if (!this.booking?.coordinates) {
      this.showToast('Client location is not available', 'medium');
      return;
    }

    try {
      // Get current location
      const coordinates = await Geolocation.getCurrentPosition({
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 60000
      });

      const workerLat = coordinates.coords.latitude;
      const workerLng = coordinates.coords.longitude;
      const clientLat = this.booking.coordinates.lat;
      const clientLng = this.booking.coordinates.lng;

      // Create Google Maps directions URL
      const mapsUrl = `https://www.google.com/maps/dir/${workerLat},${workerLng}/${clientLat},${clientLng}`;
      
      // Open Google Maps in a new window/tab
      window.open(mapsUrl, '_blank');
      
      this.showToast('Opening Google Maps for directions...', 'success');
    } catch (error) {
      console.error('Error opening Google Maps directions:', error);
      
      // Fallback: Open maps with just destination
      const clientLat = this.booking.coordinates.lat;
      const clientLng = this.booking.coordinates.lng;
      const fallbackUrl = `https://www.google.com/maps?q=${clientLat},${clientLng}`;
      
      window.open(fallbackUrl, '_blank');
      this.showToast('Opened client location in Google Maps', 'success');
    }
  }

  stopLocationTracking() {
    if (this.locationSubscription) {
      this.locationSubscription.unsubscribe();
      this.locationSubscription = undefined;
    }
    this.isLocationTracking = false;
  }

  ngOnDestroy() {
    this.subscriptions.forEach(sub => sub.unsubscribe());
    this.stopLocationTracking();
  }
}
