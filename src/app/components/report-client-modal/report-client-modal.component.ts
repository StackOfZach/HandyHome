import { Component, OnInit } from '@angular/core';
import {
  ModalController,
  ToastController,
  LoadingController,
} from '@ionic/angular';
import { ReportService } from '../../services/report.service';
import { AuthService, UserProfile } from '../../services/auth.service';
import {
  Firestore,
  addDoc,
  collection,
  serverTimestamp,
} from '@angular/fire/firestore';

export interface ClientReportCategory {
  id: string;
  name: string;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  icon: string;
}

export interface ClientReport {
  id?: string;
  reporterId: string; // Worker who is reporting
  reporterName: string;
  reporterEmail: string;
  clientId: string;
  clientName: string;
  bookingId?: string;
  reportType: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string;
  evidence?: {
    photos: string[];
    screenshots: string[];
  };
  status: 'pending' | 'under_review' | 'resolved' | 'dismissed';
  createdAt: any;
}

@Component({
  selector: 'app-report-client-modal',
  templateUrl: './report-client-modal.component.html',
  styleUrls: ['./report-client-modal.component.scss'],
  standalone: false,
})
export class ReportClientModalComponent implements OnInit {
  clientId: string = '';
  clientName: string = '';
  bookingId?: string;

  reportCategories: ClientReportCategory[] = [];
  selectedCategory: ClientReportCategory | null = null;

  reportForm = {
    title: '',
    description: '',
    evidence: {
      photos: [] as string[],
      screenshots: [] as string[],
    },
  };

  currentUser: UserProfile | null = null;
  isSubmitting = false;

  Math = Math;
  currentStep = 1;
  maxSteps = 3;

  constructor(
    private modalController: ModalController,
    private authService: AuthService,
    private toastController: ToastController,
    private loadingController: LoadingController,
    private firestore: Firestore
  ) {}

  ngOnInit() {
    this.reportCategories = this.getReportCategories();

    // Get current user
    this.authService.userProfile$.subscribe((profile) => {
      this.currentUser = profile;
    });
  }

  dismiss() {
    this.modalController.dismiss();
  }

  selectCategory(category: ClientReportCategory) {
    this.selectedCategory = category;
    this.reportForm.title = category.name;
    this.nextStep();
  }

  nextStep() {
    if (this.currentStep < this.maxSteps) {
      this.currentStep++;
    }
  }

  previousStep() {
    if (this.currentStep > 1) {
      this.currentStep--;
    }
  }

  getCategoryIcon(category: ClientReportCategory): string {
    return category.icon;
  }

  getCategorySeverityColor(category: ClientReportCategory): string {
    switch (category.severity) {
      case 'low':
        return 'text-blue-600 bg-blue-100';
      case 'medium':
        return 'text-yellow-600 bg-yellow-100';
      case 'high':
        return 'text-orange-600 bg-orange-100';
      case 'critical':
        return 'text-red-600 bg-red-100';
      default:
        return 'text-gray-600 bg-gray-100';
    }
  }

  async onFileSelected(event: any, type: 'photos' | 'screenshots') {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    for (let file of files) {
      if (file.type.startsWith('image/')) {
        const base64 = await this.fileToBase64(file);
        if (type === 'photos') {
          this.reportForm.evidence.photos.push(base64);
        } else {
          this.reportForm.evidence.screenshots.push(base64);
        }
      }
    }
  }

  private fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = (error) => reject(error);
    });
  }

  removeEvidence(index: number, type: 'photos' | 'screenshots') {
    if (type === 'photos') {
      this.reportForm.evidence.photos.splice(index, 1);
    } else {
      this.reportForm.evidence.screenshots.splice(index, 1);
    }
  }

  canProceed(): boolean {
    switch (this.currentStep) {
      case 1:
        return this.selectedCategory !== null;
      case 2:
        return this.reportForm.description.trim().length >= 20;
      case 3:
        return true;
      default:
        return false;
    }
  }

  async submitReport() {
    if (!this.currentUser || !this.selectedCategory) {
      await this.showToast('Missing required information', 'danger');
      return;
    }

    this.isSubmitting = true;
    const loading = await this.loadingController.create({
      message: 'Submitting report...',
    });
    await loading.present();

    try {
      const reportData: any = {
        reporterId: this.currentUser.uid,
        reporterName: this.currentUser.fullName || 'Unknown',
        reporterEmail: this.currentUser.email,
        clientId: this.clientId,
        clientName: this.clientName,
        bookingId: this.bookingId,
        reportType: this.selectedCategory.id,
        severity: this.selectedCategory.severity,
        title: this.reportForm.title || this.selectedCategory.name,
        description: this.reportForm.description,
        status: 'pending' as const,
        createdAt: serverTimestamp(),
      };

      // Only add evidence if there are photos or screenshots
      if (
        this.reportForm.evidence.photos.length > 0 ||
        this.reportForm.evidence.screenshots.length > 0
      ) {
        reportData.evidence = this.reportForm.evidence;
      }

      const reportsCollection = collection(this.firestore, 'clientReports');
      const docRef = await addDoc(reportsCollection, reportData);

      await this.showToast(
        'Report submitted successfully. We will review it shortly.',
        'success'
      );

      this.modalController.dismiss({
        success: true,
        reportId: docRef.id,
      });
    } catch (error) {
      console.error('Error submitting report:', error);
      await this.showToast(
        'Failed to submit report. Please try again.',
        'danger'
      );
    } finally {
      this.isSubmitting = false;
      await loading.dismiss();
    }
  }

  private getReportCategories(): ClientReportCategory[] {
    return [
      {
        id: 'payment_issue',
        name: 'Payment Issues',
        description:
          'Client refused to pay, payment disputes, or payment manipulation',
        severity: 'high',
        icon: 'card',
      },
      {
        id: 'unprofessional_behavior',
        name: 'Unprofessional Behavior',
        description:
          'Client behaved inappropriately or violated professional boundaries',
        severity: 'high',
        icon: 'warning',
      },
      {
        id: 'unsafe_environment',
        name: 'Unsafe Environment',
        description:
          'Client provided unsafe working conditions or security concerns',
        severity: 'critical',
        icon: 'shield',
      },
      {
        id: 'scope_changes',
        name: 'Scope Violations',
        description:
          'Client requested work beyond original scope without agreement',
        severity: 'medium',
        icon: 'document-text',
      },
      {
        id: 'miscommunication',
        name: 'Communication Issues',
        description:
          'Poor communication, unclear requirements, or unreasonable demands',
        severity: 'medium',
        icon: 'chatbubbles',
      },
      {
        id: 'other',
        name: 'Other Issues',
        description: 'Any other concerns not covered by the above categories',
        severity: 'low',
        icon: 'ellipsis-horizontal',
      },
    ];
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
