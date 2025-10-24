import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { AuthService, UserProfile } from '../../../services/auth.service';
import {
  DashboardService,
  ServiceCategory,
} from '../../../services/dashboard.service';
import { WorkerService, WorkerProfile } from '../../../services/worker.service';
import {
  ClientVerificationService,
  ClientVerification,
} from '../../../services/client-verification.service';
import {
  AlertController,
  ToastController,
  ModalController,
} from '@ionic/angular';

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
    totalRevenue: 0,
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

  // Service Management Properties
  serviceCategories: ServiceCategory[] = [];
  isLoadingServices: boolean = false;
  isServiceModalOpen: boolean = false;
  isEditingService: boolean = false;
  isSavingService: boolean = false;
  selectedService: ServiceCategory | null = null;
  serviceForm!: FormGroup;
  subServices: string[] = [];
  servicesPricing: string[] = [];
  servicesQuickBookingPricing: number[] = [];
  servicesQuickBookingUnit: string[] = [];
  requirements: string[] = [];

  // Client Management Properties
  clients: UserProfile[] = [];
  isLoadingClients: boolean = false;
  clientSearchTerm: string = '';
  filteredClients: UserProfile[] = [];
  selectedClient: UserProfile | null = null;
  isClientModalOpen: boolean = false;

  // Client Verification Properties
  pendingVerifications: any[] = [];
  isLoadingVerifications: boolean = false;
  selectedVerification: any = null;
  isVerificationModalOpen: boolean = false;
  reviewNotes: string = '';
  isProcessingVerification: boolean = false;

  // Analytics refresh
  isRefreshingAnalytics: boolean = false;
  lastAnalyticsUpdate: Date | null = null;

  // Icon Picker Properties
  showIconPicker: boolean = false;
  iconSearchTerm: string = '';
  selectedIconCategory: string = 'all';

  iconCategories = [
    { key: 'all', name: 'All Icons' },
    { key: 'services', name: 'Services' },
    { key: 'tools', name: 'Tools' },
    { key: 'home', name: 'Home' },
    { key: 'tech', name: 'Technology' },
    { key: 'transport', name: 'Transport' },
    { key: 'business', name: 'Business' },
    { key: 'health', name: 'Health' },
  ];

  iconsByCategory: { [key: string]: string[] } = {
    services: [
      'construct',
      'hammer',
      'build',
      'settings',
      'cog',
      'flash',
      'bulb',
      'water',
      'flame',
      'brush',
      'clean',
    ],
    tools: [
      'hammer',
      'build',
      'construct',
      'settings',
      'cog',
      'wrench',
      'cut',
      'hardware-chip',
      'flashlight',
    ],
    home: [
      'home',
      'bed',
      'cafe',
      'restaurant',
      'storefront',
      'business',
      'flower',
      'leaf',
      'sunny',
    ],
    tech: [
      'laptop',
      'desktop',
      'phone-portrait',
      'tablet-portrait',
      'tv',
      'camera',
      'videocam',
      'headset',
      'bluetooth',
      'wifi',
    ],
    transport: [
      'car',
      'car-sport',
      'bicycle',
      'bus',
      'airplane',
      'boat',
      'train',
      'walk',
      'rocket',
    ],
    business: [
      'briefcase',
      'business',
      'card',
      'cash',
      'calculator',
      'analytics',
      'bar-chart',
      'trending-up',
    ],
    health: [
      'fitness',
      'medical',
      'heart',
      'shield',
      'leaf',
      'water',
      'nutrition',
    ],
  };

  popularIcons: string[] = [
    'construct',
    'hammer',
    'flash',
    'home',
    'car',
    'leaf',
    'medical',
    'restaurant',
    'laptop',
    'camera',
    'fitness',
    'business',
    'water',
    'brush',
    'settings',
  ];

  availableIcons: string[] = [
    // Service-related icons
    'construct',
    'hammer',
    'build',
    'settings',
    'cog',
    'flash',
    'bulb',
    'water',
    'flame',
    'leaf',
    'car',
    'home',
    'business',
    'storefront',

    // Cleaning & Maintenance
    'brush',
    'clean',
    'trash',
    'refresh',
    'sync',
    'reload',
    'repeat',

    // Technology & Electronics
    'laptop',
    'desktop',
    'phone-portrait',
    'tablet-portrait',
    'tv',
    'camera',
    'videocam',
    'headset',
    'bluetooth',
    'wifi',

    // Transportation & Delivery
    'car-sport',
    'bicycle',
    'bus',
    'airplane',
    'boat',
    'train',
    'walk',
    'rocket',
    'speedometer',

    // Health & Beauty
    'fitness',
    'medical',
    'heart',
    'cut',
    'color-palette',
    'brush',

    // Food & Cooking
    'restaurant',
    'fast-food',
    'pizza',
    'cafe',
    'wine',
    'nutrition',

    // Garden & Outdoor
    'flower',
    'tree',
    'leaf',
    'sunny',
    'partly-sunny',
    'rainy',
    'snow',
    'thunderstorm',

    // Tools & Equipment
    'hammer',
    'build',
    'construct',
    'settings',
    'cog',
    'wrench',
    'hardware-chip',
    'flashlight',

    // Education & Learning
    'school',
    'library',
    'book',
    'bookmark',
    'pencil',
    'create',
    'document-text',
    'calculator',

    // Business & Professional
    'briefcase',
    'business',
    'card',
    'cash',
    'calculator',
    'analytics',
    'bar-chart',
    'pie-chart',
    'trending-up',

    // Communication
    'call',
    'chatbubble',
    'mail',
    'send',
    'share',
    'megaphone',

    // Security & Safety
    'shield',
    'lock-closed',
    'key',
    'finger-print',
    'eye',
    'warning',

    // Art & Design
    'color-palette',
    'brush',
    'images',
    'camera',
    'videocam',
    'musical-notes',

    // Sports & Recreation
    'football',
    'basketball',
    'baseball',
    'tennis',
    'golf',
    'fitness',
    'bicycle',
    'boat',
    'fish',

    // General Utility
    'star',
    'heart',
    'thumbs-up',
    'checkmark',
    'close',
    'add',
    'remove',
    'search',
    'filter',
    'options',
    'menu',
    'grid',
    'list',
    'albums',
    'folder',
    'archive',
    'download',
    'upload',
    'share',
    'copy',
    'cut',
    'paste',
    'duplicate',
    'swap-horizontal',
  ];
  filteredIcons: string[] = [];

  constructor(
    private formBuilder: FormBuilder,
    private authService: AuthService,
    private dashboardService: DashboardService,
    private workerService: WorkerService,
    private clientVerificationService: ClientVerificationService,
    private alertController: AlertController,
    private toastController: ToastController,
    private modalController: ModalController
  ) {
    this.initializeServiceForm();
  }

  ngOnInit() {
    this.authService.userProfile$.subscribe((profile) => {
      this.userProfile = profile;
    });

    this.loadAnalytics();
    this.loadPendingWorkers();
    this.loadVerifiedWorkers();
    this.loadServices();
    this.loadClients();
    this.loadPendingVerifications();
    this.initializeIconPicker();
  }

  setActiveSection(section: string) {
    this.activeSection = section;
  }

  getSectionTitle(): string {
    const titles: { [key: string]: string } = {
      dashboard: 'Dashboard Overview',
      workers: 'Worker Management',
      clients: 'Client Management',
      'client-verifications': 'Client Verifications',
      bookings: 'Booking Management',
      reports: 'Reports & Disputes',
      services: 'Services Management',
    };
    return titles[this.activeSection] || 'Dashboard';
  }

  getCurrentDate(): string {
    return new Date().toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }

  async loadAnalytics() {
    this.isRefreshingAnalytics = true;
    try {
      console.log('Loading analytics data...');
      this.analytics = await this.dashboardService.getAnalytics();
      this.lastAnalyticsUpdate = new Date();
      console.log('Analytics loaded successfully:', this.analytics);
    } catch (error) {
      console.error('Error loading analytics:', error);
      // Set fallback data for development
      this.analytics = {
        totalClients: 0,
        totalWorkers: 0,
        pendingVerifications: 0,
        activeBookings: 0,
        completedBookings: 0,
        totalRevenue: 0,
      };
    } finally {
      this.isRefreshingAnalytics = false;
    }
  }

  async refreshAnalytics() {
    await this.loadAnalytics();
    this.showSuccessToast('Dashboard data refreshed successfully');
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
      this.pendingWorkers =
        await this.workerService.getWorkersForVerification();
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
    this.filteredVerifiedWorkers = this.verifiedWorkers.filter(
      (worker) =>
        worker.fullName.toLowerCase().includes(searchTerm) ||
        worker.email.toLowerCase().includes(searchTerm) ||
        (worker.skills &&
          worker.skills.some((skill) =>
            skill.toLowerCase().includes(searchTerm)
          )) ||
        (worker.fullAddress &&
          worker.fullAddress.toLowerCase().includes(searchTerm))
    );
  }

  filterPendingWorkers() {
    if (!this.pendingWorkerSearchTerm.trim()) {
      this.filteredPendingWorkers = [...this.pendingWorkers];
      return;
    }

    const searchTerm = this.pendingWorkerSearchTerm.toLowerCase();
    this.filteredPendingWorkers = this.pendingWorkers.filter(
      (worker) =>
        worker.fullName.toLowerCase().includes(searchTerm) ||
        worker.email.toLowerCase().includes(searchTerm) ||
        (worker.skills &&
          worker.skills.some((skill) =>
            skill.toLowerCase().includes(searchTerm)
          )) ||
        (worker.fullAddress &&
          worker.fullAddress.toLowerCase().includes(searchTerm))
    );
  }

  async approveWorker(worker: WorkerProfile) {
    const alert = await this.alertController.create({
      header: 'Approve Worker',
      message: `Are you sure you want to approve ${worker.fullName}? They will be able to accept bookings.`,
      buttons: [
        {
          text: 'Cancel',
          role: 'cancel',
        },
        {
          text: 'Approve',
          cssClass: 'alert-button-confirm',
          handler: () => {
            this.processWorkerApproval(worker, true);
          },
        },
      ],
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
          role: 'cancel',
        },
        {
          text: 'Reject',
          cssClass: 'alert-button-destructive',
          handler: () => {
            this.processWorkerApproval(worker, false);
          },
        },
      ],
    });
    await alert.present();
  }

  async processWorkerApproval(worker: WorkerProfile, approved: boolean) {
    this.processingWorker = worker.uid;
    try {
      await this.workerService.verifyWorker(worker.uid, approved);

      // Remove from pending workers
      this.pendingWorkers = this.pendingWorkers.filter(
        (w) => w.uid !== worker.uid
      );
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
          role: 'cancel',
        },
        {
          text: 'Suspend',
          cssClass: 'alert-button-confirm',
          handler: () => {
            this.processWorkerStatusChange(worker, 'suspended');
          },
        },
      ],
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
          role: 'cancel',
        },
        {
          text: 'Ban',
          cssClass: 'alert-button-destructive',
          handler: () => {
            this.processWorkerStatusChange(worker, 'banned');
          },
        },
      ],
    });
    await alert.present();
  }

  async processWorkerStatusChange(worker: WorkerProfile, newStatus: string) {
    this.processingWorker = worker.uid;
    try {
      await this.workerService.updateWorkerStatus(worker.uid, newStatus as any);

      // Remove from verified workers
      this.verifiedWorkers = this.verifiedWorkers.filter(
        (w) => w.uid !== worker.uid
      );
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
        title: title,
      },
    });

    // For now, we'll use a simple alert with the image
    const alert = await this.alertController.create({
      header: title,
      message: `<img src="${photoData}" style="max-width: 100%; height: auto;" />`,
      buttons: ['Close'],
    });
    await alert.present();
  }

  private async showSuccessToast(message: string) {
    const toast = await this.toastController.create({
      message: message,
      duration: 3000,
      color: 'success',
      position: 'bottom',
    });
    await toast.present();
  }

  private async showErrorToast(message: string) {
    const toast = await this.toastController.create({
      message: message,
      duration: 3000,
      color: 'danger',
      position: 'bottom',
    });
    await toast.present();
  }

  // Utility Methods for Table View

  getInitials(fullName: string): string {
    return fullName
      .split(' ')
      .map((name) => name.charAt(0))
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

  // Certificate Helper Methods

  getWorkerCertificateKeys(
    certificates: { [skillName: string]: string } | undefined
  ): string[] {
    return certificates ? Object.keys(certificates) : [];
  }

  isCertificateImage(certificateData: string): boolean {
    // Check if the base64 data is an image (starts with data:image)
    return certificateData?.startsWith('data:image/') || false;
  }

  downloadCertificate(certificateData: string, skillName: string) {
    try {
      // Create a blob from the base64 data
      const byteCharacters = atob(certificateData.split(',')[1]);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);

      // Determine the file type from the base64 header
      let mimeType = 'application/pdf';
      let fileExtension = 'pdf';

      if (certificateData.startsWith('data:image/')) {
        const imageType = certificateData.split(';')[0].split('/')[1];
        mimeType = `image/${imageType}`;
        fileExtension = imageType;
      }

      const blob = new Blob([byteArray], { type: mimeType });

      // Create download link
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${skillName}_Certificate.${fileExtension}`;

      // Trigger download
      document.body.appendChild(link);
      link.click();

      // Cleanup
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      this.showToast(
        `Certificate for ${skillName} downloaded successfully`,
        'success'
      );
    } catch (error) {
      console.error('Error downloading certificate:', error);
      this.showToast('Failed to download certificate', 'danger');
    }
  }

  openImageInNewTab(imageData: string, title: string) {
    try {
      // Create a new window/tab
      const newWindow = window.open('', '_blank');

      if (newWindow) {
        // Write HTML content to the new window
        newWindow.document.write(`
          <!DOCTYPE html>
          <html>
            <head>
              <title>${title} - HandyHome</title>
              <style>
                body {
                  margin: 0;
                  padding: 20px;
                  background-color: #f5f5f5;
                  font-family: Arial, sans-serif;
                  display: flex;
                  flex-direction: column;
                  align-items: center;
                  min-height: 100vh;
                }
                .header {
                  background-color: #fff;
                  padding: 15px 30px;
                  border-radius: 8px;
                  box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                  margin-bottom: 20px;
                  width: 100%;
                  max-width: 800px;
                  box-sizing: border-box;
                }
                .header h1 {
                  margin: 0;
                  color: #333;
                  font-size: 24px;
                  text-align: center;
                }
                .image-container {
                  background-color: #fff;
                  padding: 20px;
                  border-radius: 8px;
                  box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                  max-width: 90%;
                  max-height: 80vh;
                  overflow: auto;
                }
                .image {
                  max-width: 100%;
                  height: auto;
                  border-radius: 8px;
                  box-shadow: 0 4px 15px rgba(0,0,0,0.2);
                }
                .controls {
                  margin-top: 20px;
                  text-align: center;
                }
                .btn {
                  background-color: #3b82f6;
                  color: white;
                  border: none;
                  padding: 10px 20px;
                  border-radius: 6px;
                  cursor: pointer;
                  margin: 0 10px;
                  font-size: 14px;
                }
                .btn:hover {
                  background-color: #2563eb;
                }
                .btn-secondary {
                  background-color: #6b7280;
                }
                .btn-secondary:hover {
                  background-color: #4b5563;
                }
              </style>
            </head>
            <body>
              <div class="header">
                <h1>${title}</h1>
              </div>
              <div class="image-container">
                <img src="${imageData}" alt="${title}" class="image" />
                <div class="controls">
                  <button class="btn" onclick="window.print()">Print</button>
                  <button class="btn btn-secondary" onclick="window.close()">Close</button>
                </div>
              </div>
            </body>
          </html>
        `);
        newWindow.document.close();
      } else {
        // Fallback: Show toast if popup was blocked
        this.showToast(
          'Please allow popups to view images in new tab',
          'warning'
        );
      }
    } catch (error) {
      console.error('Error opening image in new tab:', error);
      this.showToast('Failed to open image in new tab', 'danger');
    }
  }

  // Service Management Methods

  initializeServiceForm() {
    this.serviceForm = this.formBuilder.group({
      name: ['', [Validators.required, Validators.minLength(2)]],
      description: ['', [Validators.required, Validators.minLength(10)]],
      icon: ['', Validators.required],
      color: ['#3B82F6', Validators.required],
      isActive: [true],
      requiresCertificate: [false],
    });
  }

  async loadServices() {
    this.isLoadingServices = true;
    try {
      this.serviceCategories =
        await this.dashboardService.getServiceCategories();
    } catch (error) {
      console.error('Error loading services:', error);
      this.showToast('Error loading services', 'danger');
    }
    this.isLoadingServices = false;
  }

  openAddServiceModal() {
    this.isEditingService = false;
    this.selectedService = null;
    this.resetServiceForm();
    this.isServiceModalOpen = true;
  }

  editService(service: ServiceCategory) {
    this.isEditingService = true;
    this.selectedService = service;
    this.populateServiceForm(service);
    this.isServiceModalOpen = true;
  }

  populateServiceForm(service: ServiceCategory) {
    this.serviceForm.patchValue({
      name: service.name,
      description: service.description,
      icon: service.icon,
      color: service.color,
      isActive: service.isActive,
      requiresCertificate: service.requiresCertificate || false,
    });

    this.subServices = [...(service.services || [])];
    this.servicesPricing = [...(service.servicesPricing || [])];
    this.servicesQuickBookingPricing = [...(service.servicesQuickBookingPricing || [])];
    this.servicesQuickBookingUnit = [...(service.servicesQuickBookingUnit || [])];
    
    // Ensure arrays match subServices length
    while (this.servicesPricing.length < this.subServices.length) {
      this.servicesPricing.push('per_hour');
    }
    while (this.servicesQuickBookingPricing.length < this.subServices.length) {
      this.servicesQuickBookingPricing.push(0);
    }
    while (this.servicesQuickBookingUnit.length < this.subServices.length) {
      this.servicesQuickBookingUnit.push('per_hour');
    }
    this.servicesPricing = this.servicesPricing.slice(0, this.subServices.length);
    this.servicesQuickBookingPricing = this.servicesQuickBookingPricing.slice(0, this.subServices.length);
    this.servicesQuickBookingUnit = this.servicesQuickBookingUnit.slice(0, this.subServices.length);
    
    this.requirements = [...(service.requirements || [])];
  }

  resetServiceForm() {
    this.serviceForm.reset({
      name: '',
      description: '',
      icon: '',
      color: '#3B82F6',
      isActive: true,
      requiresCertificate: false,
    });

    this.subServices = [];
    this.servicesPricing = [];
    this.servicesQuickBookingPricing = [];
    this.servicesQuickBookingUnit = [];
    this.requirements = [];
  }

  closeServiceModal() {
    this.isServiceModalOpen = false;
    this.isEditingService = false;
    this.selectedService = null;
    this.showIconPicker = false;
    this.iconSearchTerm = '';
    this.filteredIcons = [...this.availableIcons];
    this.resetServiceForm();
  }

  addSubService() {
    this.subServices.push('');
    this.servicesPricing.push('per_hour'); // Default to per hour pricing
    this.servicesQuickBookingPricing.push(0); // Default to 0 for quick booking pricing
    this.servicesQuickBookingUnit.push('per_hour'); // Default to per hour for quick booking unit
  }

  removeSubService(index: number) {
    this.subServices.splice(index, 1);
    this.servicesPricing.splice(index, 1);
    this.servicesQuickBookingPricing.splice(index, 1);
    this.servicesQuickBookingUnit.splice(index, 1);
  }

  addRequirement() {
    this.requirements.push('');
  }

  removeRequirement(index: number) {
    this.requirements.splice(index, 1);
  }

  updateServicePricing(index: number, pricing: string) {
    this.servicesPricing[index] = pricing;
  }

  updateQuickBookingPricing(index: number, price: number) {
    this.servicesQuickBookingPricing[index] = price;
  }

  updateQuickBookingUnit(index: number, unit: string) {
    this.servicesQuickBookingUnit[index] = unit;
  }

  async saveService() {
    if (this.serviceForm.invalid) {
      this.showToast('Please fill in all required fields', 'danger');
      return;
    }

    this.isSavingService = true;

    try {
      const formValue = this.serviceForm.value;
      const serviceData: ServiceCategory = {
        id: this.isEditingService
          ? this.selectedService!.id
          : this.generateServiceId(),
        name: formValue.name,
        description: formValue.description,
        icon: formValue.icon,
        color: formValue.color,
        isActive: formValue.isActive,
        requiresCertificate: formValue.requiresCertificate || false,
        services: this.subServices.filter((s) => s.trim() !== ''),
        servicesPricing: this.servicesPricing.slice(0, this.subServices.filter((s) => s.trim() !== '').length),
        servicesQuickBookingPricing: this.servicesQuickBookingPricing.slice(0, this.subServices.filter((s) => s.trim() !== '').length),
        servicesQuickBookingUnit: this.servicesQuickBookingUnit.slice(0, this.subServices.filter((s) => s.trim() !== '').length),
        requirements: this.requirements.filter((r) => r.trim() !== ''),
      };

      if (this.isEditingService) {
        await this.dashboardService.updateServiceCategory(serviceData);
        this.showToast('Service updated successfully', 'success');
      } else {
        await this.dashboardService.addServiceCategory(serviceData);
        this.showToast('Service created successfully', 'success');
      }

      await this.loadServices();
      this.closeServiceModal();
    } catch (error) {
      console.error('Error saving service:', error);
      this.showToast('Error saving service. Please try again.', 'danger');
    }

    this.isSavingService = false;
  }

  async toggleServiceStatus(service: ServiceCategory) {
    const alert = await this.alertController.create({
      header: service.isActive ? 'Deactivate Service' : 'Activate Service',
      message: `Are you sure you want to ${
        service.isActive ? 'deactivate' : 'activate'
      } "${service.name}"?`,
      buttons: [
        {
          text: 'Cancel',
          role: 'cancel',
        },
        {
          text: service.isActive ? 'Deactivate' : 'Activate',
          handler: async () => {
            try {
              const updatedService = {
                ...service,
                isActive: !service.isActive,
              };
              await this.dashboardService.updateServiceCategory(updatedService);
              await this.loadServices();
              this.showToast(
                `Service ${
                  service.isActive ? 'deactivated' : 'activated'
                } successfully`,
                'success'
              );
            } catch (error) {
              console.error('Error updating service status:', error);
              this.showToast('Error updating service status', 'danger');
            }
          },
        },
      ],
    });

    await alert.present();
  }

  async deleteService(service: ServiceCategory) {
    const alert = await this.alertController.create({
      header: 'Delete Service',
      message: `Are you sure you want to delete "${service.name}"? This action cannot be undone.`,
      buttons: [
        {
          text: 'Cancel',
          role: 'cancel',
        },
        {
          text: 'Delete',
          role: 'destructive',
          handler: async () => {
            try {
              await this.dashboardService.deleteServiceCategory(service.id);
              await this.loadServices();
              this.showToast('Service deleted successfully', 'success');
            } catch (error) {
              console.error('Error deleting service:', error);
              this.showToast('Error deleting service', 'danger');
            }
          },
        },
      ],
    });

    await alert.present();
  }

  private generateServiceId(): string {
    return (
      'service_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9)
    );
  }

  // Client Management Methods

  async loadClients() {
    this.isLoadingClients = true;
    try {
      console.log('Loading clients...');
      this.clients = await this.dashboardService.getUsersByRole('client');
      console.log('Loaded clients:', this.clients);
      this.filteredClients = [...this.clients];
      console.log('Filtered clients:', this.filteredClients);
    } catch (error) {
      console.error('Error loading clients:', error);
      this.showToast('Error loading clients', 'danger');
    }
    this.isLoadingClients = false;
  }

  filterClients() {
    if (!this.clientSearchTerm.trim()) {
      this.filteredClients = [...this.clients];
      return;
    }

    const searchTerm = this.clientSearchTerm.toLowerCase();
    this.filteredClients = this.clients.filter(
      (client) =>
        client.fullName.toLowerCase().includes(searchTerm) ||
        client.email.toLowerCase().includes(searchTerm) ||
        client.phone?.toLowerCase().includes(searchTerm)
    );
  }

  viewClientDetails(client: UserProfile) {
    this.selectedClient = client;
    this.isClientModalOpen = true;
  }

  closeClientModal() {
    this.isClientModalOpen = false;
    this.selectedClient = null;
  }

  async sendMessageToClient(client: UserProfile) {
    // This would open a messaging modal or redirect to messaging system
    this.showToast(
      `Messaging feature for ${client.fullName} coming soon`,
      'warning'
    );
  }

  async deleteClient(client: UserProfile) {
    const alert = await this.alertController.create({
      header: 'Delete Client',
      message: `Are you sure you want to permanently delete "${client.fullName}"? This action cannot be undone.`,
      buttons: [
        {
          text: 'Cancel',
          role: 'cancel',
        },
        {
          text: 'Delete',
          role: 'destructive',
          handler: async () => {
            // For now, just show a warning that this feature is not yet implemented
            this.showToast('Delete functionality coming soon', 'warning');
          },
        },
      ],
    });
    await alert.present();
  }

  // Icon Picker Methods

  initializeIconPicker() {
    this.filteredIcons = [...this.availableIcons];
  }

  filterIcons() {
    let iconsToFilter = this.availableIcons;

    // Filter by category first
    if (this.selectedIconCategory !== 'all') {
      iconsToFilter = this.iconsByCategory[this.selectedIconCategory] || [];
    }

    // Then filter by search term
    if (!this.iconSearchTerm.trim()) {
      this.filteredIcons = [...iconsToFilter];
    } else {
      const searchTerm = this.iconSearchTerm.toLowerCase();
      this.filteredIcons = iconsToFilter.filter((icon) =>
        icon.toLowerCase().includes(searchTerm)
      );
    }
  }

  selectIcon(icon: string) {
    this.serviceForm.patchValue({ icon });
    this.showIconPicker = false;
    this.iconSearchTerm = '';
    this.filteredIcons = [...this.availableIcons];
  }

  selectIconCategory(categoryKey: string) {
    this.selectedIconCategory = categoryKey;
    this.filterIcons();
  }

  getActiveServicesCount(): number {
    return this.serviceCategories.filter((service) => service.isActive).length;
  }

  getInactiveServicesCount(): number {
    return this.serviceCategories.filter((service) => !service.isActive).length;
  }

  // Client Verification Management Methods

  async loadPendingVerifications() {
    this.isLoadingVerifications = true;
    try {
      this.pendingVerifications =
        await this.clientVerificationService.getPendingVerifications();
      console.log('Loaded pending verifications:', this.pendingVerifications);
    } catch (error) {
      console.error('Error loading pending verifications:', error);
      this.showToast('Error loading pending verifications', 'danger');
    }
    this.isLoadingVerifications = false;
  }

  viewVerificationDetails(verification: ClientVerification) {
    this.selectedVerification = verification;
    this.isVerificationModalOpen = true;
    this.reviewNotes = '';
  }

  closeVerificationModal() {
    this.isVerificationModalOpen = false;
    this.selectedVerification = null;
    this.reviewNotes = '';
  }

  async approveVerification() {
    if (!this.selectedVerification) return;

    const alert = await this.alertController.create({
      header: 'Approve Verification',
      message: `Are you sure you want to approve ${this.selectedVerification.userName}'s verification?`,
      buttons: [
        {
          text: 'Cancel',
          role: 'cancel',
        },
        {
          text: 'Approve',
          handler: async () => {
            await this.processVerificationAction('approve');
          },
        },
      ],
    });
    await alert.present();
  }

  async rejectVerification() {
    if (!this.selectedVerification) return;

    if (!this.reviewNotes.trim()) {
      this.showToast('Please provide a reason for rejection', 'warning');
      return;
    }

    const alert = await this.alertController.create({
      header: 'Reject Verification',
      message: `Are you sure you want to reject ${this.selectedVerification.userName}'s verification?`,
      buttons: [
        {
          text: 'Cancel',
          role: 'cancel',
        },
        {
          text: 'Reject',
          role: 'destructive',
          handler: async () => {
            await this.processVerificationAction('reject');
          },
        },
      ],
    });
    await alert.present();
  }

  private async processVerificationAction(action: 'approve' | 'reject') {
    if (!this.selectedVerification) return;

    this.isProcessingVerification = true;
    try {
      const currentUser = this.authService.getCurrentUserProfile();
      if (!currentUser) {
        throw new Error('Admin user not found');
      }

      if (action === 'approve') {
        await this.clientVerificationService.approveVerification(
          this.selectedVerification.id!,
          currentUser.uid,
          this.reviewNotes
        );
        this.showToast(
          `${this.selectedVerification.userName}'s verification approved successfully`,
          'success'
        );
      } else {
        await this.clientVerificationService.rejectVerification(
          this.selectedVerification.id!,
          currentUser.uid,
          this.reviewNotes
        );
        this.showToast(
          `${this.selectedVerification.userName}'s verification rejected`,
          'warning'
        );
      }

      // Refresh the list
      await this.loadPendingVerifications();
      this.closeVerificationModal();
    } catch (error) {
      console.error(`Error ${action}ing verification:`, error);
      this.showToast(`Failed to ${action} verification`, 'danger');
    }
    this.isProcessingVerification = false;
  }

  private async showToast(
    message: string,
    color: 'success' | 'danger' | 'warning'
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
