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
        // Resize and compress to ensure Firestore base64 size limits are respected
        const compressedDataUrl = await this.compressDataUrl(
          image.dataUrl,
          1024,
          1024,
          0.7
        );
        if (type === 'id') {
          this.idImageUrl = compressedDataUrl;
          this.idImageFile = this.dataURLtoFile(
            compressedDataUrl,
            'id-image.jpg'
          );
        } else {
          this.profileImageUrl = compressedDataUrl;
          this.profileImageFile = this.dataURLtoFile(
            compressedDataUrl,
            'profile-image.jpg'
          );
        }
      }
    } catch (error) {
      console.error('Error capturing image:', error);
      this.showToast('Failed to capture image', 'danger');
    }
  }

  private async compressDataUrl(
    dataUrl: string,
    maxWidth: number,
    maxHeight: number,
    quality: number
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const originalWidth = img.width;
        const originalHeight = img.height;

        const widthRatio = maxWidth / originalWidth;
        const heightRatio = maxHeight / originalHeight;
        const scale = Math.min(1, widthRatio, heightRatio);

        const targetWidth = Math.floor(originalWidth * scale);
        const targetHeight = Math.floor(originalHeight * scale);

        const canvas = document.createElement('canvas');
        canvas.width = targetWidth;
        canvas.height = targetHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas not supported'));
          return;
        }
        ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

        // Always export as JPEG to get better compression
        const compressed = canvas.toDataURL('image/jpeg', quality);
        resolve(compressed);
      };
      img.onerror = (e) => reject(e);
      img.src = dataUrl;
    });
  }

  private dataURLtoFile(dataURL: string, filename: string): File {
    const arr = dataURL.split(',');
    const headerMatch = arr[0].match(/:(.*?);/);
    const mime = headerMatch ? headerMatch[1] : 'image/jpeg';
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
