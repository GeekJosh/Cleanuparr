import { signalStore, withState, withMethods, patchState } from '@ngrx/signals';
import { inject } from '@angular/core';
import { WhisparrConfig } from '../../shared/models/whisparr-config.model';
import { ArrInstance, CreateArrInstanceDto } from '../../shared/models/arr-config.model';
import { ConfigurationService } from '../../core/services/configuration.service';
import { Observable, switchMap, catchError, of, tap, finalize } from 'rxjs';

type WhisparrConfigState = {
  config: WhisparrConfig | null;
  loading: boolean;
  saving: boolean;
  loadError: string | null;
  saveError: string | null;
};

const initialState: WhisparrConfigState = {
  config: null,
  loading: false,
  saving: false,
  loadError: null,
  saveError: null,
};

export const WhisparrConfigStore = signalStore(
  { providedIn: 'root' },
  withState(initialState),
  withMethods((store, configService = inject(ConfigurationService)) => ({
    loadConfig(): void {
      patchState(store, { loading: true, loadError: null });
      
      configService.getWhisparrConfig().pipe(
        tap(config => {
          patchState(store, { 
            config, 
            loading: false, 
            loadError: null 
          });
        }),
        catchError(error => {
          console.error('Failed to load Whisparr config:', error);
          patchState(store, { 
            loading: false, 
            loadError: error.message || 'Failed to load Whisparr configuration' 
          });
          return of(null);
        })
      ).subscribe();
    },

    saveConfig(updates: { failedImportMaxStrikes: number }): void {
      patchState(store, { saving: true, saveError: null });
      
      configService.updateWhisparrConfig(updates).pipe(
        tap(() => {
          // Update local state
          const currentConfig = store.config();
          if (currentConfig) {
            patchState(store, { 
              config: {
                ...currentConfig,
                failedImportMaxStrikes: updates.failedImportMaxStrikes
              },
              saving: false,
              saveError: null
            });
          }
        }),
        catchError(error => {
          console.error('Failed to save Whisparr config:', error);
          patchState(store, { 
            saving: false, 
            saveError: error.message || 'Failed to save Whisparr configuration'
          });
          return of(null);
        })
      ).subscribe();
    },

    createInstance(instance: CreateArrInstanceDto): Observable<ArrInstance | null> {
      return configService.createWhisparrInstance(instance).pipe(
        tap(newInstance => {
          if (newInstance) {
            const currentConfig = store.config();
            if (currentConfig) {
              patchState(store, {
                config: {
                  ...currentConfig,
                  instances: [...currentConfig.instances, newInstance]
                }
              });
            }
          }
        }),
        catchError(error => {
          console.error('Failed to create Whisparr instance:', error);
          return of(null);
        })
      );
    },

    updateInstance(id: string, instance: CreateArrInstanceDto): Observable<ArrInstance | null> {
      return configService.updateWhisparrInstance(id, instance).pipe(
        tap(updatedInstance => {
          if (updatedInstance) {
            const currentConfig = store.config();
            if (currentConfig) {
              const updatedInstances = currentConfig.instances.map(inst => 
                inst.id === id ? updatedInstance : inst
              );
              patchState(store, {
                config: {
                  ...currentConfig,
                  instances: updatedInstances
                }
              });
            }
          }
        }),
        catchError(error => {
          console.error('Failed to update Whisparr instance:', error);
          return of(null);
        })
      );
    },

    deleteInstance(id: string): Observable<boolean> {
      return configService.deleteWhisparrInstance(id).pipe(
        tap(() => {
          const currentConfig = store.config();
          if (currentConfig) {
            const filteredInstances = currentConfig.instances.filter(inst => inst.id !== id);
            patchState(store, {
              config: {
                ...currentConfig,
                instances: filteredInstances
              }
            });
          }
        }),
        switchMap(() => of(true)),
        catchError(error => {
          console.error('Failed to delete Whisparr instance:', error);
          return of(false);
        })
      );
    },

    clearErrors(): void {
      patchState(store, { loadError: null, saveError: null });
    }
  }))
); 