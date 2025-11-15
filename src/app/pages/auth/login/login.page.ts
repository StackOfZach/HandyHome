import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { AuthService } from '../../../services/auth.service';
import { ClientVerificationService } from '../../../services/client-verification.service';
import { LoadingController, AlertController } from '@ionic/angular';
import { Router } from '@angular/router';

@Component({
  selector: 'app-login',
  templateUrl: './login.page.html',
  styleUrls: ['./login.page.scss'],
  standalone: false,
})
export class LoginPage implements OnInit {
  loginForm: FormGroup;
  isLoading = false;
  showPassword = false;

  constructor(
    private formBuilder: FormBuilder,
    private authService: AuthService,
    private clientVerificationService: ClientVerificationService,
    private loadingController: LoadingController,
    private alertController: AlertController,
    private router: Router
  ) {
    this.loginForm = this.formBuilder.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(6)]],
    });
  }

  async ngOnInit() {
    // Check if user is already logged in (additional safety check)
    if (this.authService.isAuthenticated()) {
      const profile = this.authService.getCurrentUserProfile();
      if (profile) {
        console.log('LoginPage: User already authenticated, redirecting...');
        await this.redirectBasedOnRole(profile.role);
        return;
      }
    }

    // Also listen for authentication changes
    this.authService.currentUser$.subscribe(async (user) => {
      if (user) {
        const profile = this.authService.getCurrentUserProfile();
        if (profile) {
          console.log(
            'LoginPage: User authenticated during session, redirecting...'
          );
          await this.redirectBasedOnRole(profile.role);
        }
      }
    });
  }

  async onLogin() {
    if (this.loginForm.valid) {
      const { email, password } = this.loginForm.value;

      const loading = await this.loadingController.create({
        message: 'Logging in...',
        spinner: 'crescent',
      });
      await loading.present();

      try {
        this.isLoading = true;
        await this.authService.login(email, password);
        // Navigation is handled by AuthService
      } catch (error: any) {
        // Check if it's a ban or suspension error and show special modal
        if (error.message && error.message.includes('banned')) {
          await this.showBannedUserModal();
        } else if (error.message && error.message.includes('suspended')) {
          await this.showSuspendedUserModal(error.message);
        } else {
          await this.showErrorAlert(this.getErrorMessage(error));
        }
      } finally {
        this.isLoading = false;
        await loading.dismiss();
      }
    } else {
      await this.showErrorAlert(
        'Please fill in all required fields correctly.'
      );
    }
  }

  private getErrorMessage(error: any): string {
    switch (error.code) {
      case 'auth/user-not-found':
        return 'No account found with this email address.';
      case 'auth/wrong-password':
        return 'Incorrect password.';
      case 'auth/invalid-email':
        return 'Invalid email address.';
      case 'auth/user-disabled':
        return 'This account has been disabled.';
      case 'auth/too-many-requests':
        return 'Too many failed attempts. Please try again later.';
      default:
        // Skip ban and suspension errors as they have special modals
        if (
          error.message &&
          (error.message.includes('banned') ||
            error.message.includes('suspended'))
        ) {
          return 'Authentication failed.';
        }
        // Check for custom verification errors
        if (error.message === 'WORKER_NOT_VERIFIED') {
          return 'Your worker account is pending verification. Please wait for our team to review and approve your application. You will be notified via email once your account is verified.';
        }
        if (error.message === 'CLIENT_NOT_VERIFIED') {
          return 'Your account is pending verification. Please wait for our team to review and approve your application. You will be notified via email once your account is verified.';
        }
        return 'Login failed. Please try again.';
    }
  }

  private async showErrorAlert(message: string) {
    // Determine header based on message content
    const header = message.includes('pending verification')
      ? 'Account Verification Pending'
      : 'Login Error';

    const alert = await this.alertController.create({
      header,
      message,
      buttons: ['OK'],
    });
    await alert.present();
  }

  private async showBannedUserModal() {
    const alert = await this.alertController.create({
      header: 'Account Banned',
      message: `Your Account Has Been Banned

We regret to inform you that your account has been suspended from our platform.

If you believe this is a mistake or would like to appeal this decision, please send an email to:

Handyhome2026@gmail.com

Thank you for your understanding.`,
      buttons: [
        {
          text: 'OK',
          role: 'cancel',
        },
      ],
      cssClass: 'banned-user-modal',
    });
    await alert.present();
  }

  private async showSuspendedUserModal(errorMessage: string) {
    // Extract the suspension end date from the error message
    const suspensionEndMatch = errorMessage.match(/suspended until (.+)\./);
    const suspensionEndDate = suspensionEndMatch
      ? suspensionEndMatch[1]
      : 'an undetermined time';

    const alert = await this.alertController.create({
      header: 'Account Suspended',
      message: `
        <div style="text-align: center; padding: 20px;">
          <ion-icon name="time" style="font-size: 48px; color: #ffc107; margin-bottom: 16px;"></ion-icon>
          <h3 style="color: #ffc107; margin-bottom: 16px;">Your Account Is Temporarily Suspended</h3>
          <p style="margin-bottom: 16px;">Your account access has been temporarily restricted.</p>
          <p style="margin-bottom: 16px; font-weight: bold;">Suspension ends: ${suspensionEndDate}</p>
          <p style="margin-bottom: 16px;">If you believe this is a mistake or have questions about your suspension, please contact our administrator.</p>
          <p style="color: #666; font-size: 14px;">Thank you for your patience.</p>
        </div>
      `,
      buttons: [
        {
          text: 'Contact Administrator',
          handler: () => {
            this.showContactInfo();
          },
        },
        {
          text: 'OK',
          role: 'cancel',
        },
      ],
      cssClass: 'suspended-user-modal',
    });
    await alert.present();
  }

  private async showContactInfo() {
    const contactAlert = await this.alertController.create({
      header: 'Contact Administrator',
      message: `
        <div style="text-align: center; padding: 16px;">
          <p style="margin-bottom: 12px;"><strong>Email:</strong> support@handyhome.com</p>
          <p style="margin-bottom: 12px;"><strong>Support Hours:</strong> Mon-Fri 9AM-6PM</p>
          <p style="color: #666; font-size: 14px;">Please provide your registered email address and reason for appeal when contacting support.</p>
        </div>
      `,
      buttons: ['OK'],
    });
    await contactAlert.present();
  }

  private async redirectBasedOnRole(
    role: 'client' | 'worker' | 'admin'
  ): Promise<void> {
    console.log('LoginPage: Redirecting based on role:', role);

    switch (role) {
      case 'client':
        // Check if client is verified before allowing login
        try {
          const user = this.authService.getCurrentUser();
          if (user) {
            const isVerified =
              await this.clientVerificationService.isClientVerified(user.uid);
            if (isVerified) {
              console.log(
                'LoginPage: Client is verified, redirecting to dashboard'
              );
              this.router.navigate(['/pages/client/dashboard'], {
                replaceUrl: true,
              });
            } else {
              console.log(
                'LoginPage: Client not verified, redirecting to verification page'
              );
              // Redirect to verification instead of logging out
              this.router.navigate(['/pages/auth/client-verification'], {
                replaceUrl: true,
              });
            }
          }
        } catch (error) {
          console.error(
            'LoginPage: Error checking client verification:',
            error
          );
          // On error, redirect to verification instead of logging out
          this.router.navigate(['/pages/auth/client-verification'], {
            replaceUrl: true,
          });
        }
        break;
      case 'worker':
        try {
          const user = this.authService.getCurrentUser();
          if (user) {
            // Import WorkerService dynamically to avoid circular dependency
            const { WorkerService } = await import(
              '../../../services/worker.service'
            );
            const workerService = new (WorkerService as any)(
              (this.authService as any).firestore
            );

            const hasCompleted = await workerService.hasCompletedInterview(
              user.uid
            );

            if (!hasCompleted) {
              this.router.navigate(['/pages/worker/interview'], {
                replaceUrl: true,
              });
            } else {
              this.router.navigate(['/pages/worker/dashboard'], {
                replaceUrl: true,
              });
            }
          } else {
            this.router.navigate(['/pages/worker/dashboard'], {
              replaceUrl: true,
            });
          }
        } catch (error) {
          console.error('LoginPage: Error checking worker status:', error);
          this.router.navigate(['/pages/worker/dashboard'], {
            replaceUrl: true,
          });
        }
        break;
      case 'admin':
        this.router.navigate(['/pages/admin/dashboard'], { replaceUrl: true });
        break;
    }
  }

  goToSignup() {
    this.router.navigate(['/pages/auth/signup']);
  }

  togglePasswordVisibility() {
    this.showPassword = !this.showPassword;
  }
}
