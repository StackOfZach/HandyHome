import { Component, OnInit } from '@angular/core';
import {
  ModalController,
  ToastController,
  LoadingController,
} from '@ionic/angular';
import {
  ReportService,
  WorkerReport,
  ReportCategory,
} from '../../services/report.service';
import { AuthService, UserProfile } from '../../services/auth.service';

@Component({
  selector: 'app-report-worker-modal',
  templateUrl: './report-worker-modal.component.html',
  styleUrls: ['./report-worker-modal.component.scss'],
  standalone: false,
})
export class ReportWorkerModalComponent implements OnInit {
  workerId: string = '';
  workerName: string = '';
  bookingId?: string;

  reportCategories: ReportCategory[] = [];
  selectedCategory: ReportCategory | null = null;

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

  // Make Math available in template
  Math = Math;
  currentStep = 1;
  maxSteps = 3;

  constructor(
    private modalController: ModalController,
    private reportService: ReportService,
    private authService: AuthService,
    private toastController: ToastController,
    private loadingController: LoadingController
  ) {}

  ngOnInit() {
    this.reportCategories = this.reportService.getReportCategories();

    // Get current user
    this.authService.userProfile$.subscribe((profile) => {
      this.currentUser = profile;
    });
  }

  dismiss() {
    this.modalController.dismiss();
  }

  selectCategory(category: ReportCategory) {
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

  getCategoryIcon(category: ReportCategory): string {
    return category.icon;
  }

  getCategorySeverityColor(category: ReportCategory): string {
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

    // Check if user can report this worker
    const canReport = await this.reportService.canReportWorker(
      this.currentUser.uid,
      this.workerId,
      this.bookingId
    );

    if (!canReport.canReport) {
      await this.showToast(
        canReport.reason || 'Cannot submit report',
        'warning'
      );
      return;
    }

    this.isSubmitting = true;
    const loading = await this.loadingController.create({
      message: 'Submitting report...',
    });
    await loading.present();

    try {
      const reportData: Omit<WorkerReport, 'id' | 'createdAt' | 'status'> = {
        reporterId: this.currentUser.uid,
        reporterName: this.currentUser.fullName || 'Unknown',
        reporterEmail: this.currentUser.email,
        workerId: this.workerId,
        workerName: this.workerName,
        bookingId: this.bookingId,
        reportType: this.selectedCategory.id as WorkerReport['reportType'],
        severity: this.selectedCategory.severity,
        title: this.reportForm.title || this.selectedCategory.name,
        description: this.reportForm.description,
        evidence:
          this.reportForm.evidence.photos.length > 0 ||
          this.reportForm.evidence.screenshots.length > 0
            ? this.reportForm.evidence
            : undefined,
      };

      const reportId = await this.reportService.submitReport(reportData);

      await this.showToast(
        'Report submitted successfully. We will review it shortly.',
        'success'
      );

      // Close modal and return success
      this.modalController.dismiss({
        success: true,
        reportId: reportId,
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

  private async showToast(
    message: string,
    color: 'success' | 'warning' | 'danger'
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
