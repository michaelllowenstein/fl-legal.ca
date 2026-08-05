import {
  animate,
  group,
  query,
  style,
  transition,
  trigger,
} from '@angular/animations';

export const routerAnimations = trigger('routeAnimations', [
transition((fromState: string, toState: string) => Number(toState) > Number(fromState), [
    style({ position: 'relative' }),

    query(
      ':enter, :leave',
      [
        style({
          position: 'absolute',
          inset: 0,
          width: '100%',
        }),
      ],
      { optional: true },
    ),

    query(
      ':enter',
      [
        style({
          transform: 'translateX(100%)',
          opacity: 0,
        }),
      ],
      { optional: true },
    ),

    group([
      query(
        ':leave',
        [
          animate(
            '220ms ease-out',
            style({
              transform: 'translateX(-100%)',
              opacity: 0,
            }),
          ),
        ],
        { optional: true },
      ),

      query(
        ':enter',
        [
          animate(
            '220ms ease-out',
            style({
              transform: 'translateX(0)',
              opacity: 1,
            }),
          ),
        ],
        { optional: true },
      ),
    ]),
  ]),

  transition((fromState: string, toState: string) => Number(toState) < Number(fromState), [
    style({ position: 'relative' }),

    query(
      ':enter, :leave',
      [
        style({
          position: 'absolute',
          inset: 0,
          width: '100%',
        }),
      ],
      { optional: true },
    ),

    query(
      ':enter',
      [
        style({
          transform: 'translateX(-100%)',
          opacity: 0,
        }),
      ],
      { optional: true },
    ),

    group([
      query(
        ':leave',
        [
          animate(
            '220ms ease-out',
            style({
              transform: 'translateX(100%)',
              opacity: 0,
            }),
          ),
        ],
        { optional: true },
      ),

      query(
        ':enter',
        [
          animate(
            '220ms ease-out',
            style({
              transform: 'translateX(0)',
              opacity: 1,
            }),
          ),
        ],
        { optional: true },
      ),
    ]),
  ]),
]);