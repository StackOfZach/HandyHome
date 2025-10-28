import { Component } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../../services/auth.service';
import { ToastController, LoadingController } from '@ionic/angular';

@Component({
  selector: 'app-forgot-password',
  templateUrl: './forgot-password.page.html',
  styleUrls: ['./forgot-password.page.scss'],
  standalone: false,
})
export class ForgotPasswordPage {
  isSubmitting = false;

  form = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
  });

  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    private router: Router,
    private toastController: ToastController,
    private loadingController: LoadingController
  ) {}

  async sendResetLink() {
    if (this.form.invalid) {
      this.showToast('Please enter a valid email address', 'danger');
      return;
    }

    const email = this.form.value.email as string;
    this.isSubmitting = true;

    const loading = await this.loadingController.create({
      message: 'Sending reset link...',
      spinner: 'crescent',
    });
    await loading.present();

    try {
      // Prefer AuthService method if available; fallback to Firebase directly via AuthService
      if ((this.authService as any).sendPasswordResetEmail) {
        await (this.authService as any).sendPasswordResetEmail(email);
      } else {
        await this.authService.resetPassword(email);
      }

      await loading.dismiss();
      this.isSubmitting = false;
      this.showToast('Password reset email sent. Check your inbox.', 'success');
      this.router.navigate(['/pages/auth/login']);
    } catch (error) {
      await loading.dismiss();
      this.isSubmitting = false;
      console.error('Error sending reset email:', error);
      this.showToast('Failed to send reset email. Please try again.', 'danger');
    }
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
}
