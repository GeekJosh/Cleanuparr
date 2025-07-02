import { Component, OnInit, inject, effect } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { WhisparrConfigStore } from "./whisparr-config.store";
import { LoadingErrorStateComponent } from "../../shared/components/loading-error-state/loading-error-state.component";
import { WhisparrConfig } from "../../shared/models/whisparr-config.model";
import { ArrInstance, CreateArrInstanceDto } from "../../shared/models/arr-config.model";
import { NotificationService } from "../../core/services/notification.service";
import { ConfirmationService } from 'primeng/api';
import { CardModule } from 'primeng/card';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { InputNumberModule } from 'primeng/inputnumber';
import { CheckboxModule } from 'primeng/checkbox';
import { TableModule } from 'primeng/table';
import { DialogModule } from 'primeng/dialog';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { TooltipModule } from 'primeng/tooltip';
import { ProgressSpinnerModule } from 'primeng/progressspinner';

@Component({
  selector: 'app-whisparr-settings',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    LoadingErrorStateComponent,
    CardModule,
    ButtonModule,
    InputTextModule,
    InputNumberModule,
    CheckboxModule,
    TableModule,
    DialogModule,
    ConfirmDialogModule,
    TooltipModule,
    ProgressSpinnerModule
  ],
  providers: [ConfirmationService],
  templateUrl: './whisparr-settings.component.html',
  styleUrl: './whisparr-settings.component.scss'
})
export class WhisparrSettingsComponent implements OnInit {
  private formBuilder = inject(FormBuilder);
  readonly whisparrStore = inject(WhisparrConfigStore);
  private notificationService = inject(NotificationService);
  private confirmationService = inject(ConfirmationService);

  // Store signals
  readonly config = this.whisparrStore.config;
  readonly loading = this.whisparrStore.loading;
  readonly saving = this.whisparrStore.saving;
  readonly loadError = this.whisparrStore.loadError;
  readonly saveError = this.whisparrStore.saveError;

  // Forms
  globalForm!: FormGroup;
  instanceForm!: FormGroup;

  // Dialog state
  showInstanceDialog = false;
  isEditMode = false;
  editingInstanceId: string | null = null;

  ngOnInit(): void {
    // Initialize forms
    this.initializeForms();
    
    // Load configuration
    this.whisparrStore.loadConfig();
    
    // Setup effects for form updates and error handling
    this.setupEffects();
  }

  private initializeForms(): void {
    // Global configuration form
    this.globalForm = this.formBuilder.group({
      failedImportMaxStrikes: [-1, [Validators.required, Validators.min(-1)]]
    });

    // Instance form for create/edit dialog
    this.instanceForm = this.formBuilder.group({
      enabled: [true],
      name: ['', [Validators.required, Validators.minLength(1)]],
      url: ['', [Validators.required, Validators.pattern(/^https?:\/\/.+/)]],
      apiKey: ['', [Validators.required, Validators.minLength(1)]]
    });
  }

  private setupEffects(): void {
    // Update form when config changes
    effect(() => {
      const config = this.config();
      if (config) {
        this.globalForm.patchValue({
          failedImportMaxStrikes: config.failedImportMaxStrikes
        });
        this.globalForm.markAsPristine();
      }
    });

    // Handle save errors
    effect(() => {
      const saveError = this.saveError();
      if (saveError) {
        this.notificationService.showError(saveError);
        this.whisparrStore.clearErrors();
      }
    });
  }

  // Global config actions
  saveGlobalConfig(): void {
    if (this.globalForm.valid && this.globalForm.dirty) {
      const formValue = this.globalForm.value;
      this.whisparrStore.saveConfig({
        failedImportMaxStrikes: formValue.failedImportMaxStrikes
      });
      
      // Show success message when save completes
      const checkSaveCompletion = () => {
        if (!this.saving() && !this.saveError()) {
          this.notificationService.showSuccess('Whisparr global configuration saved successfully.');
          this.globalForm.markAsPristine();
        } else if (!this.saving() && this.saveError()) {
          // Error is already handled by the effect
        } else {
          setTimeout(checkSaveCompletion, 100);
        }
      };
      checkSaveCompletion();
    }
  }

  resetGlobalConfig(): void {
    const config = this.config();
    if (config) {
      this.globalForm.patchValue({
        failedImportMaxStrikes: config.failedImportMaxStrikes
      });
      this.globalForm.markAsPristine();
    }
  }

  // Instance management actions
  openCreateInstanceDialog(): void {
    this.isEditMode = false;
    this.editingInstanceId = null;
    this.instanceForm.reset({
      enabled: true,
      name: '',
      url: '',
      apiKey: ''
    });
    this.showInstanceDialog = true;
  }

  openEditInstanceDialog(instance: ArrInstance): void {
    if (!instance.id) {
      console.error('Cannot edit instance without an ID');
      return;
    }
    this.isEditMode = true;
    this.editingInstanceId = instance.id;
    this.instanceForm.patchValue({
      enabled: instance.enabled,
      name: instance.name,
      url: instance.url,
      apiKey: instance.apiKey
    });
    this.showInstanceDialog = true;
  }

  closeInstanceDialog(): void {
    this.showInstanceDialog = false;
    this.isEditMode = false;
    this.editingInstanceId = null;
    this.instanceForm.reset();
  }

  saveInstance(): void {
    if (this.instanceForm.valid) {
      const formValue = this.instanceForm.value;
      const instanceData: CreateArrInstanceDto = {
        enabled: formValue.enabled,
        name: formValue.name,
        url: formValue.url,
        apiKey: formValue.apiKey
      };

      const operation = this.isEditMode && this.editingInstanceId
        ? this.whisparrStore.updateInstance(this.editingInstanceId, instanceData)
        : this.whisparrStore.createInstance(instanceData);

      operation.subscribe({
        next: (result) => {
          if (result) {
            const message = this.isEditMode ? 'Whisparr instance updated successfully.' : 'Whisparr instance created successfully.';
            this.notificationService.showSuccess(message);
            this.closeInstanceDialog();
          } else {
            this.notificationService.showError('Failed to save Whisparr instance. Please try again.');
          }
        },
        error: (error) => {
          console.error('Error saving Whisparr instance:', error);
          this.notificationService.showError('Failed to save Whisparr instance. Please try again.');
        }
      });
    } else {
      this.notificationService.showValidationError();
    }
  }

  deleteInstance(instance: ArrInstance): void {
    if (!instance.id) {
      console.error('Cannot delete instance without an ID');
      return;
    }
    this.confirmationService.confirm({
      message: `Are you sure you want to delete the Whisparr instance "${instance.name}"?`,
      header: 'Delete Confirmation',
      icon: 'pi pi-exclamation-triangle',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => {
        this.whisparrStore.deleteInstance(instance.id!).subscribe({
          next: (success) => {
            if (success) {
              this.notificationService.showSuccess('Whisparr instance deleted successfully.');
            } else {
              this.notificationService.showError('Failed to delete Whisparr instance. Please try again.');
            }
          },
          error: (error) => {
            console.error('Error deleting Whisparr instance:', error);
            this.notificationService.showError('Failed to delete Whisparr instance. Please try again.');
          }
        });
      }
    });
  }

  // Form validation helpers
  hasError(formGroup: FormGroup, controlName: string, errorName: string): boolean {
    const control = formGroup.get(controlName);
    return control ? control.touched && control.hasError(errorName) : false;
  }

  markFormGroupTouched(formGroup: FormGroup): void {
    Object.values(formGroup.controls).forEach((control) => {
      control.markAsTouched();
      if ((control as any).controls) {
        this.markFormGroupTouched(control as FormGroup);
      }
    });
  }
} 