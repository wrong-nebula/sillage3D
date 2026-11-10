/** Low-cost elliptical footprints fitted to the actual rotated boulder splats.
 * Substeps prevent tunnelling and tangential velocity is retained for sliding.
 * Feet above the rock's top can pass over it in flight or during a jump.
 */
export function collideCliffRocks(controller, previous, rocks, ground, padding=.44) {
  const p=controller.position, v=controller.velocity;
  const dx=p.x-previous.x, dz=p.z-previous.z;
  const steps=Math.max(1,Math.ceil(Math.hypot(dx,dz)/.18));
  let x=previous.x, z=previous.z;
  for(let step=0;step<steps;step++) {
    x+=dx/steps;z+=dz/steps;
    for(let pass=0;pass<2;pass++)for(const rock of rocks) {
      if(rock.destroyed)continue;
      const rx=rock.radiusX+padding, rz=rock.radiusZ+padding;
      if(Math.abs(x-rock.x)>rx||Math.abs(z-rock.z)>rz||ground(x,z)+p.y>rock.top+.12)continue;
      let nx=(x-rock.x)/rx,nz=(z-rock.z)/rz;
      const distance=Math.hypot(nx,nz);
      if(distance>=1)continue;
      if(distance<1e-8){nx=-dx||1;nz=-dz;const length=Math.hypot(nx,nz);nx/=length;nz/=length;}
      else {nx/=distance;nz/=distance;}
      x=rock.x+nx*(rx+.001);z=rock.z+nz*(rz+.001);
      const normalX=nx/rx,normalZ=nz/rz,length=Math.hypot(normalX,normalZ);
      const ux=normalX/length,uz=normalZ/length,inward=v.x*ux+v.z*uz;
      if(inward<0){v.x-=inward*ux;v.z-=inward*uz;}
    }
  }
  p.x=x;p.z=z;
}
