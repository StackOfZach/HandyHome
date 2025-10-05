import { Component, OnInit } from '@angular/core';
import { AuthService, UserProfile } from '../../../services/auth.service';
import { WorkerService, WorkerProfile } from '../../../services/worker.service';
import { BookingService, BookingData } from '../../../services/booking.service';
import { AlertController, ToastController } from '@ionic/angular';

interface ExtendedBookingData extends BookingData {
  distance?: number;
  isProcessing?: boolean;
  clientName?: string;
  clientPhone?: string;
}

interface WorkerStats {
  jobsCompleted: number;
  monthlyEarnings: number;
  totalEarnings: number;
}

@Component({
  selector: 'app-worker-dashboard',
  templateUrl: './dashboard.page.html',
  styleUrls: ['./dashboard.page.scss'],
  standalone: false,
})
export class WorkerDashboardPage implements OnInit {
  userProfile: UserProfile | null = null;
  workerProfile: WorkerProfile | null = null;
  isAvailable: boolean = true;
  
  // Job data
  availableJobs: ExtendedBookingData[] = [];
  ongoingJobs: ExtendedBookingData[] = [];
  
  // Stats
  workerStats: WorkerStats = {
    jobsCompleted: 0,
    monthlyEarnings: 0,
    totalEarnings: 0
  };

  constructor(
    private authService: AuthService,
    private workerService: WorkerService,
    private bookingService: BookingService,
    private alertController: AlertController,
    private toastController: ToastController
  ) {}

  async ngOnInit() {
    // Subscribe to user profile
    this.authService.userProfile$.subscribe((profile) => {
      this.userProfile = profile;
      if (profile) {
        this.loadWorkerData();
      }
    });
  }

  async loadWorkerData() {
    if (!this.userProfile?.uid) return;

    try {
      // Load worker profile
      this.workerProfile = await this.workerService.getWorkerProfile(this.userProfile.uid);
      
      // Load jobs and stats
      await Promise.all([
        this.loadAvailableJobs(),
        this.loadOngoingJobs(),
        this.loadWorkerStats()
      ]);
    } catch (error) {
      console.error('Error loading worker data:', error);
      this.showToast('Error loading dashboard data', 'danger');
    }
  }

  async loadAvailableJobs() {
    if (!this.userProfile?.uid || !this.workerProfile) return;

    try {
      // Get all pending jobs that match worker's skills
      const allPendingJobs = await this.bookingService.getPendingBookings();
      
      // Filter jobs by worker's skills and work radius
      this.availableJobs = allPendingJobs
        .filter((job: BookingData) => {
          // Check if job category matches worker's skills
          const hasMatchingSkill = this.workerProfile?.skills?.some(skill => 
            skill.toLowerCase().includes(job.category.toLowerCase()) ||
            job.category.toLowerCase().includes(skill.toLowerCase())
          );
          
          return hasMatchingSkill;
        })
        .map((job: BookingData) => ({
          ...job,
          distance: this.calculateDistance(job),
          isProcessing: false
        }))
        .filter((job: ExtendedBookingData) => {
          // Filter by work radius if location data is available
          if (job.distance && this.workerProfile?.workRadius) {
            return job.distance <= this.workerProfile.workRadius;
          }
          return true; // Include job if distance cannot be calculated
        });
    } catch (error) {
      console.error('Error loading available jobs:', error);
    }
  }

  async loadOngoingJobs() {
    if (!this.userProfile?.uid) return;

    try {
      // Get jobs where this worker is assigned
      this.ongoingJobs = await this.bookingService.getWorkerJobs(this.userProfile.uid);
      this.ongoingJobs = this.ongoingJobs.map((job: BookingData) => ({
        ...job,
        isProcessing: false
      }));
    } catch (error) {
      console.error('Error loading ongoing jobs:', error);
    }
  }

  async loadWorkerStats() {
    if (!this.userProfile?.uid) return;

    try {
      // Calculate stats from completed jobs
      const completedJobs = await this.bookingService.getCompletedJobsByWorker(this.userProfile.uid);
      
      const now = new Date();
      const currentMonth = now.getMonth();
      const currentYear = now.getFullYear();
      
      this.workerStats = {
        jobsCompleted: completedJobs.length,
        monthlyEarnings: completedJobs
          .filter((job: BookingData) => {
            const jobDate = new Date(job.completedAt || job.createdAt);
            return jobDate.getMonth() === currentMonth && jobDate.getFullYear() === currentYear;
          })
          .reduce((total: number, job: BookingData) => total + (job.price - job.serviceCharge + job.transportFee), 0),
        totalEarnings: completedJobs
          .reduce((total: number, job: BookingData) => total + (job.price - job.serviceCharge + job.transportFee), 0)
      };
    } catch (error) {
      console.error('Error loading worker stats:', error);
    }
  }

  calculateDistance(job: BookingData): number | undefined {
    if (!this.workerProfile?.location || !job.locations[0]?.coordinates) {
      return undefined;
    }

    const workerLat = this.workerProfile.location.lat;
    const workerLng = this.workerProfile.location.lng;
    const jobLat = job.locations[0].coordinates.latitude;
    const jobLng = job.locations[0].coordinates.longitude;

    // Haversine formula for distance calculation
    const R = 6371; // Earth's radius in km
    const dLat = this.deg2rad(jobLat - workerLat);
    const dLng = this.deg2rad(jobLng - workerLng);
    
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(this.deg2rad(workerLat)) * Math.cos(this.deg2rad(jobLat)) * 
      Math.sin(dLng/2) * Math.sin(dLng/2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  }

  private deg2rad(deg: number): number {
    return deg * (Math.PI/180);
  }

  async refreshJobs() {
    await Promise.all([
      this.loadAvailableJobs(),
      this.loadOngoingJobs()
    ]);
    
    this.showToast('Jobs refreshed successfully', 'success');
  }

  async acceptJob(job: ExtendedBookingData) {
    if (!this.userProfile?.uid || !job.id) return;

    const alert = await this.alertController.create({
      header: 'Accept Job',
      message: `Are you sure you want to accept "${job.title}"?`,
      buttons: [
        {
          text: 'Cancel',
          role: 'cancel'
        },
        {
          text: 'Accept',
          handler: async () => {
            job.isProcessing = true;
            
            try {
              await this.bookingService.acceptBooking(job.id!, this.userProfile!.uid);
              
              // Remove from available jobs and add to ongoing
              this.availableJobs = this.availableJobs.filter(j => j.id !== job.id);
              job.status = 'accepted';
              job.isProcessing = false;
              this.ongoingJobs.unshift(job);
              
              this.showToast('Job accepted successfully!', 'success');
            } catch (error) {
              console.error('Error accepting job:', error);
              job.isProcessing = false;
              this.showToast('Error accepting job. Please try again.', 'danger');
            }
          }
        }
      ]
    });

    await alert.present();
  }

  declineJob(job: ExtendedBookingData) {
    // Remove from available jobs (just hide it)
    this.availableJobs = this.availableJobs.filter(j => j.id !== job.id);
    this.showToast('Job declined', 'medium');
  }

  async startJob(job: ExtendedBookingData) {
    if (!job.id) return;

    const alert = await this.alertController.create({
      header: 'Start Job',
      message: `Ready to start "${job.title}"?`,
      buttons: [
        {
          text: 'Cancel',
          role: 'cancel'
        },
        {
          text: 'Start',
          handler: async () => {
            job.isProcessing = true;
            
            try {
              await this.bookingService.updateBookingStatus(job.id!, 'in-progress');
              job.status = 'in-progress';
              job.isProcessing = false;
              
              this.showToast('Job started! Good luck!', 'success');
            } catch (error) {
              console.error('Error starting job:', error);
              job.isProcessing = false;
              this.showToast('Error starting job. Please try again.', 'danger');
            }
          }
        }
      ]
    });

    await alert.present();
  }

  async completeJob(job: ExtendedBookingData) {
    if (!job.id) return;

    const alert = await this.alertController.create({
      header: 'Complete Job',
      message: `Mark "${job.title}" as completed?`,
      buttons: [
        {
          text: 'Cancel',
          role: 'cancel'
        },
        {
          text: 'Complete',
          handler: async () => {
            job.isProcessing = true;
            
            try {
              await this.bookingService.updateBookingStatus(job.id!, 'completed');
              
              // Remove from ongoing jobs
              this.ongoingJobs = this.ongoingJobs.filter(j => j.id !== job.id);
              
              // Refresh stats
              await this.loadWorkerStats();
              
              this.showToast('Job completed successfully!', 'success');
            } catch (error) {
              console.error('Error completing job:', error);
              job.isProcessing = false;
              this.showToast('Error completing job. Please try again.', 'danger');
            }
          }
        }
      ]
    });

    await alert.present();
  }

  viewJobLocation(job: ExtendedBookingData) {
    // TODO: Implement map navigation or open external map app
    const address = job.locations[0]?.address;
    if (address) {
      const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
      window.open(mapsUrl, '_system');
    }
  }

  toggleAvailability() {
    this.isAvailable = !this.isAvailable;
    
    const message = this.isAvailable ? 
      'You are now available for jobs' : 
      'You are now offline';
    
    this.showToast(message, this.isAvailable ? 'success' : 'medium');
    
    // TODO: Update availability status in Firestore
  }

  getInitials(name: string): string {
    return name
      .split(' ')
      .map(n => n.charAt(0))
      .join('')
      .toUpperCase()
      .substring(0, 2);
  }

  getStatusBadgeClass(status: string): string {
    switch (status) {
      case 'accepted':
        return 'bg-blue-100 text-blue-800';
      case 'in_progress':
        return 'bg-yellow-100 text-yellow-800';
      case 'completed':
        return 'bg-green-100 text-green-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  }

  private async showToast(message: string, color: 'success' | 'danger' | 'medium') {
    const toast = await this.toastController.create({
      message,
      duration: 3000,
      color,
      position: 'bottom'
    });
    await toast.present();
  }

  async logout() {
    await this.authService.logout();
  }
}
