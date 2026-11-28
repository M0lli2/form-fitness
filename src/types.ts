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
    /** 사용자가 직접 고친 세트는 첫 세트 값 자동 반영에서 제외합니다. */
    edited?: boolean;
};
export type Session = {
    id: string;
    name: string;
    startedAt: string;
    endedAt?: string;
    restEndsAt: number | null;
    /** 이 운동에서만 쓰는 휴식 시간(초). 없으면 설정의 기본값을 씁니다. */
    restSeconds?: number;
    preparing?: true;
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
        /** 슈퍼세트 묶음 이름(A, B, …). 없으면 단독 종목입니다. */
        superset?: string;
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
    /** 인바디 결과지·피클에서 함께 온 값. 없으면 화면에 표시하지 않습니다. */
    bodyFatMass?: number;
    bmi?: number;
    inbodyScore?: number;
    sync?: string;
};
export type Routine = {
    id: string;
    name: string;
    subtitle: string;
    ids: string[];
    /** 홈 추천 카드·추천 루틴에 포함할지 여부. 없으면 포함으로 봅니다. */
    recommended?: boolean;
};
export type State = {
    schema: 1;
    customExercises: Exercise[];
    history: Session[];
    body: BodyEntry[];
    routines: Routine[];
    active: Session | null;
    seen: string[];
    /** 운동도감에서 별표로 저장한 종목 id. 백업에 없으면 빈 목록으로 읽습니다. */
    favorites?: string[];
    /** 이미 반영한 피클 인박스 항목 id. 같은 항목을 두 번 반영하지 않습니다. */
    appliedSyncIds?: string[];
    settings: {
        goal: number;
        rest: number;
        /** 훈련 목적: strength | hypertrophy | endurance */
        training?: 'strength' | 'hypertrophy' | 'endurance';
        health: boolean;
        contrast: boolean;
        units: 'kg' | 'lb';
        theme: 'light' | 'dark' | 'system';
        glass: boolean;
        /** 앱을 열 때 피클 인박스를 자동으로 읽을지 여부(없으면 켜짐). */
        pickleSync?: boolean;
        /** 피클 인박스 주소. 없으면 기본 주소를 씁니다. */
        pickleSyncUrl?: string;
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
