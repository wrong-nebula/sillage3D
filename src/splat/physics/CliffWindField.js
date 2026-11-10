import {Vector3} from 'three';

/** CPU counterpart of the cliff meadow's advected gusts. Exposure uses the same
 * terrain bake as the vegetation shader; all physical effects sample this field.
 */
export class CliffWindField {
  constructor({exposure = () => 1, strength = 1} = {}) {
    this.exposure = exposure; this.strength = strength; this.winter = 0; this.gustUntil = -1;
  }
  gust(time, duration = 3) { this.gustUntil = time + duration; }
  sample(point, time, out = new Vector3()) {
    const along = point.x * .6 + point.z * .8, across = -point.x * .8 + point.z * .6;
    let gust = .43 + .25 * Math.sin(time * .72 - along * .22)
      + .12 * Math.sin(time * 1.8 - along * .43 + across * .18);
    const front = Math.max(0, Math.sin((along - time * 3.6) * .11 + .6 * Math.sin(across * .045 + time * .12))) ** 5;
    gust += (1 - this.winter) * .58 * front * (.38 + .62 * (.5 + .5 * Math.sin(time * .2)));
    const shelter = Math.max(0, Math.min(1, this.exposure(point.x, point.z)));
    const speed = this.strength * shelter * (2.2 + 4 * gust + 2 * this.winter + (time < this.gustUntil ? 7 : 0));
    const cross = .35 * Math.sin(time * 1.15 - along * .18) * this.strength * shelter;
    return out.set(.6 * speed - .8 * cross, .12 * Math.sin(time * 1.9 + across * .3) * shelter,
      .8 * speed + .6 * cross);
  }
}
