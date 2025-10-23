import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import {
  LoadingController,
  AlertController,
  ToastController,
} from '@ionic/angular';
import { Router } from '@angular/router';
import { AuthService } from '../../../services/auth.service';
import { ClientVerificationService } from '../../../services/client-verification.service';

@Component({
  selector: 'app-client-verification',
  templateUrl: './client-verification.page.html',
  styleUrls: ['./client-verification.page.scss'],
  standalone: false,
})
export class ClientVerificationPage implements OnInit {
  verificationForm: FormGroup;
  isLoading = false;

  // Image handling
  idImageUrl: string | null = null;
  profileImageUrl: string | null = null;
  idImageFile: File | null = null;
  profileImageFile: File | null = null;

  constructor(
    private formBuilder: FormBuilder,
    private loadingController: LoadingController,
    private alertController: AlertController,
    private toastController: ToastController,
    private router: Router,
    private authService: AuthService,
    private clientVerificationService: ClientVerificationService
  ) {
    this.verificationForm = this.formBuilder.group({
      idType: ['', [Validators.required]],
      idNumber: ['', [Validators.required, Validators.minLength(5)]],
      address: ['', [Validators.required]],
      birthDate: ['', [Validators.required]],
    });
  }

  ngOnInit() {
    // Check if user is authenticated and is a client
    const userProfile = this.authService.getCurrentUserProfile();
    if (!userProfile || userProfile.role !== 'client') {
      this.router.navigate(['/pages/auth/login']);
    }
  }

  async selectIdImage() {
    try {
      const alert = await this.alertController.create({
        header: 'Select ID Image',
        message: 'Choose how you want to add your ID image',
        buttons: [
          {
            text: 'Camera',
            handler: () => {
              this.captureImage('id', CameraSource.Camera);
            },
          },
          {
            text: 'Gallery',
            handler: () => {
              this.captureImage('id', CameraSource.Photos);
            },
          },
          {
            text: 'Cancel',
            role: 'cancel',
          },
        ],
      });
      await alert.present();
    } catch (error) {
      console.error('Error selecting ID image:', error);
      this.showToast('Error accessing camera/gallery', 'danger');
    }
  }

  async captureProfileImage() {
    try {
      const alert = await this.alertController.create({
        header: 'Take Profile Picture',
        message: 'Choose how you want to add your profile picture',
        buttons: [
          {
            text: 'Camera',
            handler: () => {
              this.captureImage('profile', CameraSource.Camera);
            },
          },
          {
            text: 'Gallery',
            handler: () => {
              this.captureImage('profile', CameraSource.Photos);
            },
          },
          {
            text: 'Cancel',
            role: 'cancel',
          },
        ],
      });
      await alert.present();
    } catch (error) {
      console.error('Error capturing profile image:', error);
      this.showToast('Error accessing camera/gallery', 'danger');
    }
  }

  private async captureImage(type: 'id' | 'profile', source: CameraSource) {
    try {
      const image = await Camera.getPhoto({
        quality: 80,
        allowEditing: false,
        resultType: CameraResultType.DataUrl,
        source: source,
      });

      if (image.dataUrl) {
        if (type === 'id') {
          this.idImageUrl = image.dataUrl;
          this.idImageFile = this.dataURLtoFile(image.dataUrl, 'id-image.jpg');
        } else {
          this.profileImageUrl = image.dataUrl;
          this.profileImageFile = this.dataURLtoFile(
            image.dataUrl,
            'profile-image.jpg'
          );
        }
      }
    } catch (error) {
      console.error('Error capturing image:', error);
      this.showToast('Failed to capture image', 'danger');
    }
  }

  private dataURLtoFile(dataURL: string, filename: string): File {
    const arr = dataURL.split(',');
    const mime = arr[0].match(/:(.*?);/)![1];
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }
    return new File([u8arr], filename, { type: mime });
  }

  async submitVerification() {
    if (!this.verificationForm.valid) {
      this.showToast('Please fill in all required fields', 'warning');
      return;
    }

    if (!this.idImageFile || !this.profileImageFile) {
      this.showToast('Please upload both ID and profile images', 'warning');
      return;
    }

    const loading = await this.loadingController.create({
      message: 'Submitting verification...',
      spinner: 'crescent',
    });
    await loading.present();

    try {
      this.isLoading = true;
      const userProfile = this.authService.getCurrentUserProfile();

      if (!userProfile) {
        throw new Error('User not authenticated');
      }

      const verificationData = {
        ...this.verificationForm.value,
        userId: userProfile.uid,
        userEmail: userProfile.email,
        userName: userProfile.fullName,
        submittedAt: new Date(),
        status: 'pending' as 'pending' | 'approved' | 'rejected',
      };

      await this.clientVerificationService.submitVerification(
        verificationData,
        this.idImageFile,
        this.profileImageFile
      );

      // Show success message and logout
      const alert = await this.alertController.create({
        header: 'Verification Submitted',
        message:
          'Your verification documents have been submitted successfully. Your account will be reviewed by our admin team. You will be logged out now and can log back in once your account is approved.',
        buttons: [
          {
            text: 'OK',
            handler: async () => {
              await this.authService.logout();
              this.router.navigate(['/pages/auth/login']);
            },
          },
        ],
      });
      await alert.present();
    } catch (error: any) {
      console.error('Verification submission error:', error);
      this.showToast(
        'Failed to submit verification. Please try again.',
        'danger'
      );
    } finally {
      this.isLoading = false;
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
      position: 'top',
    });
    await toast.present();
  }

  goBack() {
    this.router.navigate(['/pages/auth/login']);
  }
}
