import { Component, OnInit } from '@angular/core';
import { AuthService, UserProfile } from '../../../services/auth.service';
import { DashboardService } from '../../../services/dashboard.service';
import { WorkerService, WorkerProfile } from '../../../services/worker.service';
import { AlertController, ToastController, ModalController } from '@ionic/angular';

interface AnalyticsData {
  totalClients: number;
  totalWorkers: number;
  pendingVerifications: number;
  activeBookings: number;
  completedBookings: number;
  totalRevenue: number;
}

@Component({
  selector: 'app-admin-dashboard',
  templateUrl: './dashboard.page.html',
  styleUrls: ['./dashboard.page.scss'],
  standalone: false,
})
export class AdminDashboardPage implements OnInit {
  userProfile: UserProfile | null = null;
  activeSection: string = 'dashboard';
  analytics: AnalyticsData = {
    totalClients: 0,
    totalWorkers: 0,
    pendingVerifications: 0,
    activeBookings: 0,
    completedBookings: 0,
    totalRevenue: 0
  };

  // Worker Management Properties
  workerActiveTab: string = 'pending';
  pendingWorkers: WorkerProfile[] = [];
  verifiedWorkers: WorkerProfile[] = [];
  filteredVerifiedWorkers: WorkerProfile[] = [];
  filteredPendingWorkers: WorkerProfile[] = [];
  isLoadingWorkers: boolean = false;
  processingWorker: string | null = null;
  workerSearchTerm: string = '';
  pendingWorkerSearchTerm: string = '';
  
  // Modal Properties
  isWorkerModalOpen: boolean = false;
  selectedWorker: WorkerProfile | null = null;

  constructor(
    private authService: AuthService,
    private dashboardService: DashboardService,
    private workerService: WorkerService,
    private alertController: AlertController,
    private toastController: ToastController,
    private modalController: ModalController
  ) {}

  ngOnInit() {
    this.authService.userProfile$.subscribe((profile) => {
      this.userProfile = profile;
    });
    
    this.loadAnalytics();
    this.loadPendingWorkers();
    this.loadVerifiedWorkers();
  }

  setActiveSection(section: string) {
    this.activeSection = section;
  }

  getSectionTitle(): string {
    const titles: { [key: string]: string } = {
      'dashboard': 'Dashboard Overview',
      'workers': 'Worker Management',
      'clients': 'Client Management',
      'bookings': 'Booking Management',
      'reports': 'Reports & Disputes',
      'services': 'Services Management',
      'finance': 'Finance',
      'notifications': 'Notifications',
      'settings': 'Settings'
    };
    return titles[this.activeSection] || 'Dashboard';
  }

  getCurrentDate(): string {
    return new Date().toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  }

  async loadAnalytics() {
    try {
      this.analytics = await this.dashboardService.getAnalytics();
    } catch (error) {
      console.error('Error loading analytics:', error);
      // Set mock data for development
      this.analytics = {
        totalClients: 245,
        totalWorkers: 89,
        pendingVerifications: 12,
        activeBookings: 34,
        completedBookings: 567,
        totalRevenue: 125430.50
      };
    }
  }

  async logout() {
    await this.authService.logout();
  }

  // Worker Management Methods

  setWorkerTab(tab: string) {
    this.workerActiveTab = tab;
    if (tab === 'pending' && this.pendingWorkers.length === 0) {
      this.loadPendingWorkers();
    } else if (tab === 'verified' && this.verifiedWorkers.length === 0) {
      this.loadVerifiedWorkers();
    }
  }

  async loadPendingWorkers() {
    this.isLoadingWorkers = true;
    try {
      this.pendingWorkers = await this.workerService.getWorkersForVerification();
      this.filteredPendingWorkers = [...this.pendingWorkers];
      console.log('Loaded pending workers:', this.pendingWorkers);
    } catch (error) {
      console.error('Error loading pending workers:', error);
      this.showErrorToast('Failed to load pending workers');
    } finally {
      this.isLoadingWorkers = false;
    }
  }

  async loadVerifiedWorkers() {
    this.isLoadingWorkers = true;
    try {
      this.verifiedWorkers = await this.workerService.getVerifiedWorkers();
      this.filteredVerifiedWorkers = [...this.verifiedWorkers];
      console.log('Loaded verified workers:', this.verifiedWorkers);
    } catch (error) {
      console.error('Error loading verified workers:', error);
      this.showErrorToast('Failed to load verified workers');
    } finally {
      this.isLoadingWorkers = false;
    }
  }

  filterVerifiedWorkers() {
    if (!this.workerSearchTerm.trim()) {
      this.filteredVerifiedWorkers = [...this.verifiedWorkers];
      return;
    }

    const searchTerm = this.workerSearchTerm.toLowerCase();
    this.filteredVerifiedWorkers = this.verifiedWorkers.filter(worker => 
      worker.fullName.toLowerCase().includes(searchTerm) ||
      worker.email.toLowerCase().includes(searchTerm) ||
      (worker.skills && worker.skills.some(skill => 
        skill.toLowerCase().includes(searchTerm)
      )) ||
      (worker.fullAddress && worker.fullAddress.toLowerCase().includes(searchTerm))
    );
  }

  filterPendingWorkers() {
    if (!this.pendingWorkerSearchTerm.trim()) {
      this.filteredPendingWorkers = [...this.pendingWorkers];
      return;
    }

    const searchTerm = this.pendingWorkerSearchTerm.toLowerCase();
    this.filteredPendingWorkers = this.pendingWorkers.filter(worker => 
      worker.fullName.toLowerCase().includes(searchTerm) ||
      worker.email.toLowerCase().includes(searchTerm) ||
      (worker.skills && worker.skills.some(skill => 
        skill.toLowerCase().includes(searchTerm)
      )) ||
      (worker.fullAddress && worker.fullAddress.toLowerCase().includes(searchTerm))
    );
  }

  async approveWorker(worker: WorkerProfile) {
    const alert = await this.alertController.create({
      header: 'Approve Worker',
      message: `Are you sure you want to approve ${worker.fullName}? They will be able to accept bookings.`,
      buttons: [
        {
          text: 'Cancel',
          role: 'cancel'
        },
        {
          text: 'Approve',
          cssClass: 'alert-button-confirm',
          handler: () => {
            this.processWorkerApproval(worker, true);
          }
        }
      ]
    });
    await alert.present();
  }

  async rejectWorker(worker: WorkerProfile) {
    const alert = await this.alertController.create({
      header: 'Reject Worker',
      message: `Are you sure you want to reject ${worker.fullName}? This action cannot be undone.`,
      buttons: [
        {
          text: 'Cancel',
          role: 'cancel'
        },
        {
          text: 'Reject',
          cssClass: 'alert-button-destructive',
          handler: () => {
            this.processWorkerApproval(worker, false);
          }
        }
      ]
    });
    await alert.present();
  }

  async processWorkerApproval(worker: WorkerProfile, approved: boolean) {
    this.processingWorker = worker.uid;
    try {
      await this.workerService.verifyWorker(worker.uid, approved);
      
      // Remove from pending workers
      this.pendingWorkers = this.pendingWorkers.filter(w => w.uid !== worker.uid);
      this.filterPendingWorkers();
      
      // If approved, add to verified workers
      if (approved) {
        worker.status = 'verified';
        this.verifiedWorkers.unshift(worker);
        this.filterVerifiedWorkers();
      }

      // Update analytics
      this.loadAnalytics();

      this.showSuccessToast(
        approved 
          ? `${worker.fullName} has been approved successfully!` 
          : `${worker.fullName} has been rejected.`
      );
    } catch (error) {
      console.error('Error processing worker approval:', error);
      this.showErrorToast('Failed to process worker approval');
    } finally {
      this.processingWorker = null;
    }
  }

  async suspendWorker(worker: WorkerProfile) {
    const alert = await this.alertController.create({
      header: 'Suspend Worker',
      message: `Are you sure you want to suspend ${worker.fullName}? They will not be able to accept new bookings.`,
      buttons: [
        {
          text: 'Cancel',
          role: 'cancel'
        },
        {
          text: 'Suspend',
          cssClass: 'alert-button-confirm',
          handler: () => {
            this.processWorkerStatusChange(worker, 'suspended');
          }
        }
      ]
    });
    await alert.present();
  }

  async banWorker(worker: WorkerProfile) {
    const alert = await this.alertController.create({
      header: 'Ban Worker',
      message: `Are you sure you want to permanently ban ${worker.fullName}? This action cannot be undone.`,
      buttons: [
        {
          text: 'Cancel',
          role: 'cancel'
        },
        {
          text: 'Ban',
          cssClass: 'alert-button-destructive',
          handler: () => {
            this.processWorkerStatusChange(worker, 'banned');
          }
        }
      ]
    });
    await alert.present();
  }

  async processWorkerStatusChange(worker: WorkerProfile, newStatus: string) {
    this.processingWorker = worker.uid;
    try {
      await this.workerService.updateWorkerStatus(worker.uid, newStatus as any);
      
      // Remove from verified workers
      this.verifiedWorkers = this.verifiedWorkers.filter(w => w.uid !== worker.uid);
      this.filterVerifiedWorkers();

      // Update analytics
      this.loadAnalytics();

      this.showSuccessToast(
        `${worker.fullName} has been ${newStatus} successfully.`
      );
    } catch (error) {
      console.error('Error updating worker status:', error);
      this.showErrorToast('Failed to update worker status');
    } finally {
      this.processingWorker = null;
    }
  }

  async openPhotoModal(photoData: string, title: string) {
    // Create a simple modal to view the full-size photo
    const modal = await this.modalController.create({
      component: null, // We'll create a simple photo viewer
      componentProps: {
        photoData: photoData,
        title: title
      }
    });
    
    // For now, we'll use a simple alert with the image
    const alert = await this.alertController.create({
      header: title,
      message: `<img src="${photoData}" style="max-width: 100%; height: auto;" />`,
      buttons: ['Close']
    });
    await alert.present();
  }

  private async showSuccessToast(message: string) {
    const toast = await this.toastController.create({
      message: message,
      duration: 3000,
      color: 'success',
      position: 'bottom'
    });
    await toast.present();
  }

  private async showErrorToast(message: string) {
    const toast = await this.toastController.create({
      message: message,
      duration: 3000,
      color: 'danger',
      position: 'bottom'
    });
    await toast.present();
  }

  // Utility Methods for Table View

  getInitials(fullName: string): string {
    return fullName
      .split(' ')
      .map(name => name.charAt(0))
      .join('')
      .toUpperCase()
      .substring(0, 2);
  }

  getFirstFewSkills(skills: string[] | undefined): string[] {
    if (!skills) return [];
    return skills.slice(0, 3);
  }

  getStatusBadgeClass(status: string | undefined): string {
    switch (status) {
      case 'verified':
        return 'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800';
      case 'pending_verification':
        return 'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800';
      case 'rejected':
        return 'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800';
      case 'suspended':
        return 'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-800';
      case 'banned':
        return 'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800';
      default:
        return 'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800';
    }
  }

  // Modal Methods

  viewWorkerDetails(worker: WorkerProfile) {
    this.selectedWorker = worker;
    this.isWorkerModalOpen = true;
  }

  closeWorkerModal() {
    this.isWorkerModalOpen = false;
    this.selectedWorker = null;
  }

  async approveWorkerFromModal(worker: WorkerProfile) {
    await this.processWorkerApproval(worker, true);
    this.closeWorkerModal();
  }

  async rejectWorkerFromModal(worker: WorkerProfile) {
    await this.processWorkerApproval(worker, false);
    this.closeWorkerModal();
  }
}
