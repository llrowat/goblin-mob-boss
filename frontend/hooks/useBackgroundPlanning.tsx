import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { Feature, IdeationResult } from "../types";

interface BackgroundPlanningState {
  /** Feature IDs currently being planned in the background */
  planningIds: Set<string>;
  /** Number of features actively planning */
  planningCount: number;
  /** Number of features currently executing */
  executingCount: number;
  /** Start tracking a feature as planning */
  addPlanning: (featureId: string) => void;
  /** Check if a feature is being planned */
  isPlanning: (featureId: string) => boolean;
  /** Completed plan results keyed by feature ID */
  completedPlans: Map<string, IdeationResult>;
  /** Consume (and remove) a completed plan for a feature */
  consumePlan: (featureId: string) => IdeationResult | null;
}

const BackgroundPlanningContext = createContext<BackgroundPlanningState>({
  planningIds: new Set(),
  planningCount: 0,
  executingCount: 0,
  addPlanning: () => {},
  isPlanning: () => false,
  completedPlans: new Map(),
  consumePlan: () => null,
});

export function BackgroundPlanningProvider({ children }: { children: React.ReactNode }) {
  const [planningIds, setPlanningIds] = useState<Set<string>>(new Set());
  const [executingCount, setExecutingCount] = useState(0);
  const [completedPlans, setCompletedPlans] = useState<Map<string, IdeationResult>>(new Map());
  const planningIdsRef = useRef<Set<string>>(planningIds);
  planningIdsRef.current = planningIds;

  const addPlanning = useCallback((featureId: string) => {
    setPlanningIds((prev) => {
      const next = new Set(prev);
      next.add(featureId);
      return next;
    });
  }, []);

  const isPlanning = useCallback((featureId: string) => {
    return planningIdsRef.current.has(featureId);
  }, []);

  const consumePlan = useCallback((featureId: string): IdeationResult | null => {
    const plan = completedPlans.get(featureId) ?? null;
    if (plan) {
      setCompletedPlans((prev) => {
        const next = new Map(prev);
        next.delete(featureId);
        return next;
      });
    }
    return plan;
  }, [completedPlans]);

  // Poll features to sync planning/executing counts and detect completed plans
  useEffect(() => {
    const poll = () => {
      invoke<Feature[]>("list_features", { repoId: null })
        .then((features) => {
          setExecutingCount(features.filter((f) => f.status === "executing").length);

          // Detect features in ideation that we should track
          const ideationFeatures = features.filter((f) => f.status === "ideation");
          const currentPlanning = planningIdsRef.current;

          // For features we're tracking, poll their plan results
          for (const featureId of currentPlanning) {
            const feature = features.find((f) => f.id === featureId);
            // If feature no longer exists or is no longer in ideation, stop tracking
            if (!feature || feature.status !== "ideation") {
              setPlanningIds((prev) => {
                const next = new Set(prev);
                next.delete(featureId);
                return next;
              });
              continue;
            }

            // Poll for plan completion or questions
            invoke<IdeationResult>("poll_ideation_result", { featureId })
              .then((result) => {
                if (result.tasks.length > 0) {
                  // Plan is ready - remove from planning, add to completed
                  setPlanningIds((prev) => {
                    const next = new Set(prev);
                    next.delete(featureId);
                    return next;
                  });
                  setCompletedPlans((prev) => {
                    const next = new Map(prev);
                    next.set(featureId, result);
                    return next;
                  });
                } else if (result.questions && result.questions.length > 0) {
                  // Questions pending — remove from planning so detail page handles it
                  setPlanningIds((prev) => {
                    const next = new Set(prev);
                    next.delete(featureId);
                    return next;
                  });
                  setCompletedPlans((prev) => {
                    const next = new Map(prev);
                    next.set(featureId, result);
                    return next;
                  });
                }
              })
              .catch(() => {});
          }

          // Also pick up any ideation features we're not yet tracking
          // (e.g., app was restarted while planning was running)
          for (const f of ideationFeatures) {
            if (!currentPlanning.has(f.id) && f.task_specs.length === 0) {
              // Check if there's already a plan on disk
              invoke<IdeationResult>("poll_ideation_result", { featureId: f.id })
                .then((result) => {
                  if (result.tasks.length === 0) {
                    // No plan yet — this feature might be actively planning
                    // We don't auto-add it since we can't distinguish "needs ideation started"
                    // from "ideation already running". The detail page handles this case.
                  }
                })
                .catch(() => {});
            }
          }
        })
        .catch(() => {});
    };

    poll();
    const interval = setInterval(poll, 3000);
    return () => clearInterval(interval);
  }, []);

  const planningCount = planningIds.size;

  return (
    <BackgroundPlanningContext.Provider
      value={{
        planningIds,
        planningCount,
        executingCount,
        addPlanning,
        isPlanning,
        completedPlans,
        consumePlan,
      }}
    >
      {children}
    </BackgroundPlanningContext.Provider>
  );
}

export function useBackgroundPlanning() {
  return useContext(BackgroundPlanningContext);
}
