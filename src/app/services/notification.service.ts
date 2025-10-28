import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import {
  Firestore,
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  doc,
  updateDoc,
  deleteDoc,
  getDocs,
  addDoc,
  serverTimestamp,
  Timestamp,
} from '@angular/fire/firestore';
import { AuthService } from './auth.service';

export interface WorkerNotification {
  id?: string;
  title: string;
  message: string;
  bookingId: string;
  categoryId: string;
  categoryName: string;
  read: boolean;
  priority: 'normal' | 'urgent';
  type: 'job_request' | 'job_update' | 'system';
  createdAt: Timestamp;
  expiresAt?: Timestamp;
}

@Injectable({
  providedIn: 'root',
})
export class NotificationService {
  private notifications$ = new BehaviorSubject<WorkerNotification[]>([]);
  private unreadCount$ = new BehaviorSubject<number>(0);
  private currentUserId: string | null = null;

  constructor(private firestore: Firestore, private authService: AuthService) {
    this.initializeNotificationListener();
  }

  private async initializeNotificationListener() {
    // Wait for user authentication
    this.authService.currentUser$.subscribe((user) => {
      if (user?.uid && user.uid !== this.currentUserId) {
        this.currentUserId = user.uid;
        this.setupNotificationListener();
      } else if (!user) {
        this.currentUserId = null;
        this.notifications$.next([]);
        this.unreadCount$.next(0);
      }
    });
  }

  private setupNotificationListener() {
    if (!this.currentUserId) return;

    const notificationsRef = collection(
      this.firestore,
      `workers/${this.currentUserId}/notifications`
    );
    const q = query(notificationsRef, orderBy('createdAt', 'desc'));

    onSnapshot(q, (snapshot) => {
      const notifications = snapshot.docs.map(
        (doc) =>
          ({
            id: doc.id,
            ...doc.data(),
          } as WorkerNotification)
      );

      // Filter out expired notifications
      const activeNotifications = notifications.filter((notification) => {
        if (!notification.expiresAt) return true;
        return notification.expiresAt.toDate() > new Date();
      });

      this.notifications$.next(activeNotifications);

      // Update unread count
      const unreadCount = activeNotifications.filter((n) => !n.read).length;
      this.unreadCount$.next(unreadCount);

      // Show toast for new urgent notifications
      const newUrgentNotifications = activeNotifications.filter(
        (n) => !n.read && n.priority === 'urgent' && n.type === 'job_request'
      );

      if (newUrgentNotifications.length > 0) {
        this.showNewJobNotification(newUrgentNotifications[0]);
      }
    });
  }

  private showNewJobNotification(notification: WorkerNotification) {
    // This will be handled by the dashboard component
    // We could also use Ionic Toast Controller here for system-wide notifications
    console.log('New urgent notification:', notification);
  }

  getNotifications(): Observable<WorkerNotification[]> {
    return this.notifications$.asObservable();
  }

  getUnreadCount(): Observable<number> {
    return this.unreadCount$.asObservable();
  }

  async markAsRead(notificationId: string): Promise<void> {
    if (!this.currentUserId) return;

    const notificationRef = doc(
      this.firestore,
      `workers/${this.currentUserId}/notifications/${notificationId}`
    );
    await updateDoc(notificationRef, {
      read: true,
    });
  }

  async markAllAsRead(): Promise<void> {
    if (!this.currentUserId) return;

    const currentNotifications = this.notifications$.value;
    const unreadNotifications = currentNotifications.filter((n) => !n.read);

    const promises = unreadNotifications.map((notification) =>
      this.markAsRead(notification.id!)
    );

    await Promise.all(promises);
  }

  async clearAllNotifications(): Promise<void> {
    if (!this.currentUserId) return;

    const notificationsRef = collection(
      this.firestore,
      `workers/${this.currentUserId}/notifications`
    );

    // Prefer deleting by current in-memory list to avoid extra read
    const current = this.notifications$.value;
    if (current.length > 0) {
      await Promise.all(
        current
          .filter((n) => !!n.id)
          .map((n) =>
            deleteDoc(
              doc(
                this.firestore,
                `workers/${this.currentUserId}/notifications/${n.id}`
              )
            )
          )
      );
    } else {
      // Fallback: fetch and delete
      const snapshot = await getDocs(notificationsRef);
      const deletions = snapshot.docs.map((d) => deleteDoc(d.ref));
      await Promise.all(deletions);
    }

    // Reset local state
    this.notifications$.next([]);
    this.unreadCount$.next(0);
  }

  async createJobNotification(
    workerId: string,
    bookingData: any
  ): Promise<void> {
    const notificationRef = collection(
      this.firestore,
      `workers/${workerId}/notifications`
    );

    // Set expiration time (30 seconds from now for auto-decline)
    const expiresAt = new Date();
    expiresAt.setSeconds(expiresAt.getSeconds() + 30);

    await addDoc(notificationRef, {
      title: 'New Job Available',
      message: `${bookingData.categoryName} - ${bookingData.subService} near your area`,
      bookingId: bookingData.id,
      categoryId: bookingData.categoryId,
      categoryName: bookingData.categoryName,
      read: false,
      priority: 'urgent',
      type: 'job_request',
      createdAt: serverTimestamp(),
      expiresAt: Timestamp.fromDate(expiresAt),
    });
  }

  async sendJobUpdateNotification(
    workerId: string,
    title: string,
    message: string,
    bookingId: string
  ): Promise<void> {
    const notificationRef = collection(
      this.firestore,
      `workers/${workerId}/notifications`
    );

    await addDoc(notificationRef, {
      title,
      message,
      bookingId,
      categoryId: '',
      categoryName: '',
      read: false,
      priority: 'normal',
      type: 'job_update',
      createdAt: serverTimestamp(),
    });
  }
}
