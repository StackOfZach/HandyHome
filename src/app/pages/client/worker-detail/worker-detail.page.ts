import { Component, OnInit } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { WorkerService, WorkerProfile } from '../../../services/worker.service';
import { AuthService, UserProfile } from '../../../services/auth.service';
import { LoadingController, ModalController, ToastController } from '@ionic/angular';

interface WorkerReview {
  id: string;
  clientName: string;
  rating: number;
  comment: string;
  serviceType: string;
  date: Date;
  verified: boolean;
}

interface WorkerCertificate {
  id: string;
  name: string;
  issuer: string;
  dateObtained: Date;
  expiryDate?: Date;
  imageUrl?: string;
  verified: boolean;
}

@Component({
  selector: 'app-worker-detail',
  templateUrl: './worker-detail.page.html',
  styleUrls: ['./worker-detail.page.scss'],
  standalone: false,
})
export class WorkerDetailPage implements OnInit {
  worker: WorkerProfile | null = null;
  workerId: string = '';
  isLoading = true;
  reviews: WorkerReview[] = [];
  certificates: WorkerCertificate[] = [];
  currentUser: UserProfile | null = null;
  showAllReviews = false;
  showAllSkills = false;
  showAllCertificates = false;

  // Gallery for worker photos/portfolio
  galleryImages: string[] = [];
  selectedImageIndex = 0;

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private workerService: WorkerService,
    private authService: AuthService,
    private loadingController: LoadingController,
    private modalController: ModalController,
    private toastController: ToastController
  ) {}

  async ngOnInit() {
    // Get worker ID from route params
    this.workerId = this.route.snapshot.queryParamMap.get('workerId') || '';
    
    if (!this.workerId) {
      this.showToast('Worker not found', 'danger');
      this.router.navigate(['/client/browse-workers']);
      return;
    }

    await this.loadWorkerDetails();
    await this.getCurrentUser();
  }

  private async loadWorkerDetails() {
    const loading = await this.loadingController.create({
      message: 'Loading worker details...',
      spinner: 'crescent'
    });
    await loading.present();

    try {
      // Load complete worker profile (includes user data and profile picture)
      this.worker = await this.workerService.getCompleteWorkerProfile(this.workerId);
      
      if (!this.worker) {
        throw new Error('Worker not found');
      }

      // Load reviews
      await this.loadWorkerReviews();
      
      // Load certificates
      await this.loadWorkerCertificates();
      
      // Load gallery images
      this.loadGalleryImages();

    } catch (error) {
      console.error('Error loading worker details:', error);
      this.showToast('Failed to load worker details', 'danger');
      this.router.navigate(['/client/browse-workers']);
    } finally {
      this.isLoading = false;
      await loading.dismiss();
    }
  }

  private async loadWorkerReviews() {
    try {
      // Mock reviews data - replace with actual Firestore call
      this.reviews = [
        {
          id: '1',
          clientName: 'John Doe',
          rating: 5,
          comment: 'Excellent work! Very professional and completed the job on time.',
          serviceType: 'Plumbing',
          date: new Date(2024, 9, 1),
          verified: true
        },
        {
          id: '2',
          clientName: 'Jane Smith',
          rating: 4,
          comment: 'Good service, but arrived a bit late. Overall satisfied with the work quality.',
          serviceType: 'Electrical',
          date: new Date(2024, 8, 15),
          verified: true
        },
        {
          id: '3',
          clientName: 'Mike Johnson',
          rating: 5,
          comment: 'Outstanding service! Will definitely hire again.',
          serviceType: 'Carpentry',
          date: new Date(2024, 8, 5),
          verified: false
        }
      ];
    } catch (error) {
      console.error('Error loading reviews:', error);
    }
  }

  private async loadWorkerCertificates() {
    try {
      // Mock certificates data - replace with actual Firestore call
      this.certificates = [
        {
          id: '1',
          name: 'Licensed Electrician',
          issuer: 'Department of Labor',
          dateObtained: new Date(2020, 5, 15),
          expiryDate: new Date(2025, 5, 15),
          verified: true
        },
        {
          id: '2',
          name: 'Safety Training Certificate',
          issuer: 'OSHA',
          dateObtained: new Date(2023, 2, 10),
          expiryDate: new Date(2026, 2, 10),
          verified: true
        },
        {
          id: '3',
          name: 'Advanced Plumbing Techniques',
          issuer: 'Technical Institute',
          dateObtained: new Date(2021, 8, 20),
          verified: false
        }
      ];
    } catch (error) {
      console.error('Error loading certificates:', error);
    }
  }

  private loadGalleryImages() {
    // Mock gallery images - replace with actual worker portfolio images
    this.galleryImages = [
      'assets/portfolio/worker1-1.jpg',
      'assets/portfolio/worker1-2.jpg',
      'assets/portfolio/worker1-3.jpg'
    ];
  }

  private async getCurrentUser() {
    const user = await this.authService.getCurrentUser();
    // Convert User to UserProfile format if needed
    this.currentUser = user ? {
      uid: user.uid,
      email: user.email || '',
      fullName: user.displayName || '',
      phone: '',
      role: 'client',
      createdAt: new Date()
    } : null;
  }

  // Helper methods
  getStarArray(rating: number): boolean[] {
    const stars = [];
    for (let i = 1; i <= 5; i++) {
      stars.push(i <= rating);
    }
    return stars;
  }

  getDisplayedReviews(): WorkerReview[] {
    return this.showAllReviews ? this.reviews : this.reviews.slice(0, 3);
  }

  getDisplayedSkills(): string[] {
    if (!this.worker?.skills) return [];
    return this.showAllSkills ? this.worker.skills : this.worker.skills.slice(0, 6);
  }

  getDisplayedCertificates(): WorkerCertificate[] {
    return this.showAllCertificates ? this.certificates : this.certificates.slice(0, 3);
  }

  toggleReviews() {
    this.showAllReviews = !this.showAllReviews;
  }

  toggleSkills() {
    this.showAllSkills = !this.showAllSkills;
  }

  toggleCertificates() {
    this.showAllCertificates = !this.showAllCertificates;
  }

  // Navigation methods
  goBack() {
    this.router.navigate(['/client/browse-workers']);
  }

  async scheduleBooking() {
    if (!this.worker) {
      this.showToast('Worker information not available', 'danger');
      return;
    }

    this.router.navigate(['/client/schedule-booking'], {
      queryParams: { 
        workerId: this.worker.uid,
        workerName: this.worker.fullName
      }
    });
  }

  async contactWorker() {
    // Implement messaging functionality
    this.showToast('Messaging feature coming soon!', 'primary');
  }

  async shareWorker() {
    // Implement share functionality
    if (navigator.share && this.worker) {
      try {
        await navigator.share({
          title: `${this.worker.fullName} - HandyHome Worker`,
          text: `Check out ${this.worker.fullName}'s profile on HandyHome`,
          url: window.location.href
        });
      } catch (error) {
        console.log('Error sharing:', error);
      }
    } else {
      // Fallback - copy link to clipboard
      try {
        await navigator.clipboard.writeText(window.location.href);
        this.showToast('Link copied to clipboard!', 'success');
      } catch (error) {
        this.showToast('Unable to share at this time', 'warning');
      }
    }
  }

  // Gallery methods
  openImageGallery(index: number) {
    this.selectedImageIndex = index;
    // Open full-screen image viewer modal
  }

  // Utility methods
  formatDate(date: Date): string {
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    }).format(date);
  }

  getExperienceYears(): number {
    // Calculate experience based on createdAt date or return default
    if (!this.worker?.createdAt) return 1;
    const years = (new Date().getFullYear() - this.worker.createdAt.getFullYear());
    return Math.max(1, years);
  }

  getCompletionRate(): number {
    // For now, return a default high completion rate
    // In a real app, this would be calculated from actual job data
    return 95;
  }

  private async showToast(message: string, color: string) {
    const toast = await this.toastController.create({
      message,
      duration: 3000,
      color,
      position: 'bottom',
    });
    await toast.present();
  }
}