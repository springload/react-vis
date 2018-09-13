// Copyright (c) 2016 - 2017 Uber Technologies, Inc.
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
// THE SOFTWARE.

import React from 'react';
import PropTypes from 'prop-types';
import {
  hierarchy,
  partition
} from 'd3-hierarchy';

import {
  scaleLinear,
  scaleSqrt
} from 'd3-scale';
import {arc as arcBuilder} from 'd3-shape';

import {AnimationPropType} from 'animation';
import LabelSeries from '../plot/series/label-series';
import ArcSeries from 'plot/series/arc-series';
import XYPlot from 'plot/xy-plot';
import {getRadialDomain} from 'utils/series-utils';
import {getRadialLayoutMargin} from 'utils/chart-utils';

const predefinedClassName = 'rv-sunburst';

const LISTENERS_TO_OVERWRITE = [
  'onValueMouseOver',
  'onValueMouseOut',
  'onValueClick',
  'onValueRightClick',
  'onSeriesMouseOver',
  'onSeriesMouseOut',
  'onSeriesClick',
  'onSeriesRightClick'
];

/**
 * Create the list of nodes to render.
 * @param {Object} props
   props.data {Object} - tree structured data (each node has a name anc an array of children)
   props.height {number} - the height of the graphic to be rendered
   props.hideRootNode {boolean} - whether or not to hide the root node
   props.width {number} - the width of the graphic to be rendered
   props.getSize {function} - accessor for the size
 * @returns {Array} Array of nodes.,
 * multiplier
 */
function getNodesToRender({data, height, hideRootNode, width, getSize}) {
  const partitionFunction = partition();
  const structuredInput = hierarchy(data).sum(getSize);
  const radius = (Math.min(width, height) / 4);
  const x = scaleLinear().range([0, 2 * Math.PI]);
  const y = scaleSqrt().range([0, radius]);

  return partitionFunction(structuredInput).descendants()
    .reduce((res, cell, index) => {
      if (hideRootNode && index === 0) {
        return res;
      }

      const depthMultipler = [
        0, // center
        0.5,
        1,
        1.5,
        2,
        2.5
      ];

      const fontMultiplier = [
        25,
        16,
        11,
        9,
        8,
        7
      ];

      const getInnerMultipler = (depth) => {
        return depthMultipler[depth];
      }

      const getOuterMultipler = (depth) => {
        return depthMultipler[depth + 1];
      }

      const endRadius = Math.max(0, y(cell.y1)) * getOuterMultipler(cell.depth);
      const startRadius = Math.max(0, y(cell.y0)) * getInnerMultipler(cell.depth);

      return res.concat([{
        angle0: Math.max(0, Math.min(2 * Math.PI, x(cell.x0))),
        angle: Math.max(0, Math.min(2 * Math.PI, x(cell.x1))),
        radius0: startRadius,
        radius: endRadius,
        width: endRadius - startRadius,
        depth: cell.depth,
        parent: cell.parent,
        fontSize: fontMultiplier[cell.depth],
        ...cell.data
      }]);
    }, []);
}

/**
 * Convert arc nodes into label rows.
 * Important to use mappedData rather than regular data, bc it is already unrolled
 * @param {Array} mappedData - Array of nodes.
 * @param {Object} accessors - object of accessors
 * @returns {Array} array of node for rendering as labels
 */
function buildLabels(mappedData, accessors) {
  const {
    getAngle,
    getAngle0,
    getLabel,
    getRadius,
    getRadius0,
    getFontSize
  } = accessors;

  return mappedData
  .filter(getLabel)
  .map(row => {
    const radius = (getRadius(row) + getRadius0(row)) / 2;
    const truedAngle = -1 * getAngle(row) + Math.PI / 2;
    const truedAngle0 = -1 * getAngle0(row) + Math.PI / 2;
    const angle = (truedAngle0 + truedAngle) / 2;
    const hypotenuse = [Math.cos(angle) * radius, Math.sin(angle) * radius];
    const rotateLabels = !row.dontRotateLabel;
    const rotAngle = -angle / (2 * Math.PI) * 360;
    const rotation = rotateLabels ? (
      rotAngle > 90 ? (rotAngle + 180) :
      rotAngle === 90 ? 90 : (rotAngle)) : null;

    return {
      ...row,
      children: null,
      angle: null,
      radius: null,
      x: hypotenuse[0],
      y: hypotenuse[1],
      style: {
        textAnchor: 'middle',
        fontSize: getFontSize(row),
        ...row.labelStyle
      },
      rotation
    };
  });
}

const NOOP = () => {};

class Sunburst extends React.Component {
  render() {
    const {
      getAngle,
      getAngle0,
      animation,
      className,
      children,
      data,
      height,
      hideRootNode,
      getLabel,
      width,
      getSize,
      colorType
    } = this.props;
    const mappedData = getNodesToRender({data, height, hideRootNode, width, getSize});
    const radialDomain = getRadialDomain(mappedData);
    const margin = getRadialLayoutMargin(width, height, radialDomain);
    const labelData = buildLabels(mappedData, {
      getAngle,
      getAngle0,
      getLabel,
      getRadius: d => d.radius,
      getRadius0: d => d.radius0,
      width: d => d.width,
      getFontSize: d => d.fontSize
    });

    const hofBuilder = f => (e, i) => f ? f(mappedData[e.index], i) : NOOP;
    return (
      <XYPlot
        height={height}
        hasTreeStructure
        width={width}
        className={`${predefinedClassName} ${className}`}
        margin={margin}
        xDomain={[-radialDomain, radialDomain]}
        yDomain={[-radialDomain, radialDomain]}>
        <ArcSeries {...{
          colorType,
          ...this.props,
          animation,
          // need to present a stripped down version for interpolation
          data: animation ?
            mappedData.map((row, index) => ({...row, parent: null, children: null, index})) :
            mappedData,
          _data: animation ? mappedData : null,
          arcClassName: `${predefinedClassName}__series--radial__arc`,
          ...(LISTENERS_TO_OVERWRITE.reduce((acc, propName) => {
            const prop = this.props[propName];
            acc[propName] = animation ? hofBuilder(prop) : prop;
            return acc;
          }, {}))
        }}/>
        {labelData.length > 0 && (<LabelSeries labelAnchorX="middle" labelAnchorY="middle" data={labelData} getLabel={getLabel}/>)}
        {children}
      </XYPlot>
    );
  }
}

Sunburst.displayName = 'Sunburst';
Sunburst.propTypes = {
  animation: AnimationPropType,
  getAngle: PropTypes.func,
  getAngle0: PropTypes.func,
  className: PropTypes.string,
  colorType: PropTypes.string,
  data: PropTypes.object.isRequired,
  height: PropTypes.number.isRequired,
  hideRootNode: PropTypes.bool,
  getLabel: PropTypes.func,
  onValueClick: PropTypes.func,
  onValueMouseOver: PropTypes.func,
  onValueMouseOut: PropTypes.func,
  getSize: PropTypes.func,
  width: PropTypes.number.isRequired
};
Sunburst.defaultProps = {
  getAngle: d => d.angle,
  getAngle0: d => d.angle0,
  className: '',
  colorType: 'literal',
  getColor: d => d.color,
  hideRootNode: false,
  getLabel: d => d.label,
  getSize: d => d.size
};

export default Sunburst;
