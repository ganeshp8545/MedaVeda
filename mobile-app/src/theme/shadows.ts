export const SHADOW = {
  card: {
    shadowColor: "#000000",
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: {
      width: 0,
      height: 6,
    },
    elevation: 4,
  },

  raised: {
    shadowColor: "#000000",
    shadowOpacity: 0.5,
    shadowRadius: 20,
    shadowOffset: {
      width: 0,
      height: 10,
    },
    elevation: 6,
  },

  subtle: {
    shadowColor: "#000000",
    shadowOpacity: 0.25,
    shadowRadius: 6,
    shadowOffset: {
      width: 0,
      height: 2,
    },
    elevation: 1,
  },

  // Warm terracotta glow - use behind accent buttons/icons/active states
  // to get the "dark premium glow" look instead of a plain black shadow.
  glow: {
    shadowColor: "#E2703D",
    shadowOpacity: 0.45,
    shadowRadius: 16,
    shadowOffset: {
      width: 0,
      height: 0,
    },
    elevation: 8,
  },
};
