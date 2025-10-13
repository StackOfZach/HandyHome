import { Component, OnInit, OnDestroy } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AlertController, ToastController, LoadingController } from '@ionic/angular';
import { Subscription } from 'rxjs';
import { BookingService } from '../../../services/booking.service';
import { AuthService } from '../../../services/auth.service';

@Component({
  selector: 'app-job-request-details',
  templateUrl: './job-request-details.page.html',
  styleUrls: ['./job-request-details.page.scss'],
  standalone: false
})
export class JobRequestDetailsPage implements OnInit, OnDestroy {
  booking: any = null;
  bookingId: string = '';
  loading = true;
  error: string = '';
  private bookingSubscription?: Subscription;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private bookingService: BookingService,
    private authService: AuthService,
    private alertController: AlertController,
    private toastController: ToastController,
    private loadingController: LoadingController
  ) {}

  ngOnInit() {
    this.bookingId = this.route.snapshot.paramMap.get('id') || '';
    if (this.bookingId) {
      this.loadBookingDetails();
    } else {
      this.error = 'Invalid booking ID';
      this.loading = false;
    }
  }

  ngOnDestroy() {
    if (this.bookingSubscription) {
      this.bookingSubscription.unsubscribe();
    }
  }

  loadBookingDetails() {
    this.loading = true;
    this.error = '';

    this.bookingSubscription = this.bookingService.getBookingById$(this.bookingId).subscribe({
      next: async (booking: any) => {
        if (booking) {
          // Fetch client details from users collection
          if (booking.clientId) {
            try {
              const clientDetails = await this.authService.getUserProfile(booking.clientId);
              booking.clientDetails = clientDetails;
            } catch (error) {
              console.warn('Could not fetch client details for booking:', booking.id, error);
            }
          }
          
          this.booking = booking;
          this.loading = false;
        } else {
          this.error = 'Booking not found';
          this.loading = false;
        }
      },
      error: (error: any) => {
        console.error('Error loading booking details:', error);
        this.error = 'Failed to load booking details';
        this.loading = false;
      }
    });
  }

  async approveRequest() {
    const alert = await this.alertController.create({
      header: 'Approve Request',
      message: 'Are you sure you want to approve this booking request?',
      buttons: [
        {
          text: 'Cancel',
          role: 'cancel'
        },
        {
          text: 'Approve',
          handler: async () => {
            await this.updateBookingStatus('accepted', 'Booking request approved successfully!');
          }
        }
      ]
    });

    await alert.present();
  }

  async rejectRequest() {
    const alert = await this.alertController.create({
      header: 'Reject Request',
      message: 'Are you sure you want to reject this booking request?',
      buttons: [
        {
          text: 'Cancel',
          role: 'cancel'
        },
        {
          text: 'Reject',
          handler: async () => {
            await this.updateBookingStatus('cancelled', 'Booking request rejected.');
          }
        }
      ]
    });

    await alert.present();
  }

  private async updateBookingStatus(status: string, message: string) {
    const loading = await this.loadingController.create({
      message: 'Updating booking...'
    });
    await loading.present();

    try {
      const currentUser = await this.authService.getCurrentUser();
      if (!currentUser) {
        throw new Error('User not authenticated');
      }

      await this.bookingService.updateBookingStatus(this.bookingId, status as any, { workerId: currentUser.uid });
      
      await loading.dismiss();
      
      const toast = await this.toastController.create({
        message: message,
        duration: 2000,
        color: status === 'accepted' ? 'success' : 'warning',
        position: 'top'
      });
      await toast.present();

      // Navigate back to job requests
      this.router.navigate(['/pages/worker/job-listings']);
    } catch (error) {
      await loading.dismiss();
      console.error('Error updating booking status:', error);
      
      const toast = await this.toastController.create({
        message: 'Failed to update booking status',
        duration: 3000,
        color: 'danger',
        position: 'top'
      });
      await toast.present();
    }
  }

  // Helper methods for safe property access
  getServiceName(): string {
    return this.booking?.serviceType || this.booking?.title || this.booking?.category || 'Service not specified';
  }

  getServiceDescription(): string {
    return this.booking?.description || 'No description provided';
  }

  getCustomerName(): string {
    // First check if we have client details from the users collection
    if (this.booking?.clientDetails) {
      const client = this.booking.clientDetails;
      if (client.fullName) return client.fullName;
      if (client.firstName && client.lastName) return `${client.firstName} ${client.lastName}`;
      if (client.firstName) return client.firstName;
      if (client.email) return client.email;
    }
    
    // Fallback to booking data fields
    return this.booking?.customerName || this.booking?.clientName || this.booking?.userName || 'Unknown Customer';
  }

  getCustomerEmail(): string {
    // First check client details from users collection
    if (this.booking?.clientDetails?.email) {
      return this.booking.clientDetails.email;
    }
    
    // Fallback to booking data
    return this.booking?.customerEmail || this.booking?.clientEmail || this.booking?.userEmail || 'Email not provided';
  }

  getCustomerPhone(): string {
    // First check client details from users collection
    if (this.booking?.clientDetails?.phoneNumber) {
      return this.booking.clientDetails.phoneNumber;
    }
    
    // Fallback to booking data
    return this.booking?.customerPhone || this.booking?.clientPhone || this.booking?.userPhone || 'Phone not provided';
  }

  getCustomerProfileImage(): string {
    if (this.booking?.clientDetails?.profileImage) {
      return this.booking.clientDetails.profileImage;
    }
    return ''; // Return empty string for default avatar
  }

  getScheduledDate(): string {
    if (this.booking?.scheduledDate) {
      const date = this.booking.scheduledDate.toDate ? 
        this.booking.scheduledDate.toDate() : 
        new Date(this.booking.scheduledDate);
      return date.toLocaleDateString();
    }
    if (this.booking?.schedule?.date) {
      return this.booking.schedule.date;
    }
    return 'Date not specified';
  }

  getScheduledTime(): string {
    if (this.booking?.scheduledTime) {
      return this.booking.scheduledTime;
    }
    if (this.booking?.schedule?.time) {
      return this.booking.schedule.time;
    }
    return 'Time not specified';
  }

  getLocation(): string {
    if (this.booking?.location) {
      if (typeof this.booking.location === 'string') {
        return this.booking.location;
      }
      if (this.booking.location.address) {
        return `${this.booking.location.address || ''}, ${this.booking.location.city || ''}, ${this.booking.location.province || ''}`.trim().replace(/^,|,$/g, '');
      }
    }
    if (this.booking?.locations && Array.isArray(this.booking.locations) && this.booking.locations.length > 0) {
      const loc = this.booking.locations[0];
      return loc.address || 'Location not specified';
    }
    return 'Location not provided';
  }

  getServiceFee(): number {
    return this.booking?.pricing?.serviceFee || this.booking?.pricing?.basePrice || this.booking?.price || 0;
  }

  getTransportationFee(): number {
    return this.booking?.pricing?.transportationFee || this.booking?.pricing?.transportFee || this.booking?.transportFee || 0;
  }

  getTotalAmount(): number {
    if (this.booking?.pricing?.total) {
      return this.booking.pricing.total;
    }
    if (this.booking?.total) {
      return this.booking.total;
    }
    return this.getServiceFee() + this.getTransportationFee();
  }

  getStatus(): string {
    return this.booking?.status || 'pending';
  }

  getStatusColor(): string {
    const status = this.getStatus();
    switch (status) {
      case 'accepted': return 'success';
      case 'cancelled': return 'danger';
      case 'completed': return 'primary';
      case 'in-progress': return 'secondary';
      case 'on-the-way': return 'tertiary';
      default: return 'warning';
    }
  }

  canApproveOrReject(): boolean {
    const status = this.getStatus();
    return status === 'pending';
  }

  goBack() {
    this.router.navigate(['/pages/worker/job-listings']);
  }
}
