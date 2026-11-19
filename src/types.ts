export type Exercise = {
    id: string;
    name: string;
    muscle: string;
    equipment: string;
    level: string;
    type: string;
    steps: string[];
    caution: string;
};
export type SetEntry = {
    id: string;
    weight: number;
    reps: number;
    seconds: number;
    distance: number;
    rpe: string;
    kind: string;
    done: boolean;
};
export type Session = {
    id: string;
    name: string;
    startedAt: string;
    endedAt?: string;
    restEndsAt: number | null;
    pausedAt?: number;
    pausedMs?: number;
    pausedRestMs?: number;
    exercises: {
        id: string;
        name: string;
        type: string;
        muscle: string;
        sets: SetEntry[];
        note: string;
    }[];
    sync?: string;
    external?: boolean;
};
export type BodyEntry = {
    revision?: number;
    id: string;
    date: string;
    weight: number;
    bodyFat?: number;
    muscle?: number;
    height?: number;
    waist?: number;
    visceralFat?: number;
    bmr?: number;
    source: string;
    note: string;
    photo: string | null;
    sync?: string;
};
export type Routine = {
    id: string;
    name: string;
    subtitle: string;
    ids: string[];
};
export type State = {
    schema: 1;
    customExercises: Exercise[];
    history: Session[];
    body: BodyEntry[];
    routines: Routine[];
    active: Session | null;
    seen: string[];
    settings: {
        goal: number;
        rest: number;
        health: boolean;
        contrast: boolean;
        units: 'kg' | 'lb';
        theme: 'light' | 'dark' | 'system';
        glass: boolean;
    };
};

