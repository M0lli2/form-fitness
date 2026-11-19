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

/** 최근 7일 근육별 볼륨 집계 한 줄입니다. level은 그 주 최대 사용량을 1로 둔 상대값입니다. */
export type MuscleLoadRow = {
    id: string;
    name: string;
    latin: string;
    region: string;
    sets: number;
    volume: number;
    primarySets: number;
    secondarySets: number;
    share: number;
    level: number;
};
/** 주간 근육 볼륨 히트맵이 그리는 요약입니다. */
export type WeeklyMuscleLoad = {
    start: string;
    end: string;
    days: number;
    sessions: number;
    totalSets: number;
    totalVolume: number;
    maxSets: number;
    muscles: MuscleLoadRow[];
    top: string[];
    untrained: string[];
    hasData: boolean;
};
