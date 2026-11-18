import { requireNativeModule } from 'expo-modules-core';
type HealthSummary = {
    steps: number | null;
    heartRate: number | null;
    weight: number | null;
    bodyFat: number | null;
    workouts: {
        id: string;
        name: string;
        start: string;
        end: string;
    }[];
};
type DeviceModule = {
    healthAvailable(): Promise<boolean>;
    authorize(): Promise<boolean>;
    readHealth(): Promise<HealthSummary>;
    saveBody(id: string, date: string, weight: number, fat: number | null, revision: number): Promise<void>;
    saveWorkout(id: string, name: string, start: string, end: string): Promise<void>;
    watchStatus(): Promise<{
        connected: boolean;
        paired: boolean;
    }>;
    sendWatch(payload: string): Promise<void>;
    drainWatch(): Promise<string[]>;
    ackWatch(ids: string[]): Promise<void>;
};
export default requireNativeModule<DeviceModule>('FormDevice');
