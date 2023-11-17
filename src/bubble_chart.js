/* bubbleChart creation function. Returns a function that will
 * instantiate a new bubble chart given a DOM element to display
 * it in and a dataset to visualize.
 *
 * Organization and style inspired by:
 * https://bost.ocks.org/mike/chart/
 *
 */
var fillColor;

function bubbleChart() {
  // Constants for sizing
  var width = 1240;
  var height = 600;
  var parseDate = d3.timeParse("%Y-%m-%d %H:%M:%S.%L");
  var formatTime = d3.timeFormat("%b, %d %Y");


  // tooltip for mouseover functionality
  var tooltip = floatingTooltip('gates_tooltip', 240);

  // Locations to move bubbles towards, depending
  // on which view mode is selected.
  var center = { x: width / 2, y: height / 2 };

  var monthCenters;
  var monthTitleX;

  var areaCenters;
  var areasTitleX;

  var accountCenters;
  var accountsTitleX;

  // @v4 strength to apply to the position forces
  var forceStrength = 0.03;

  // These will be set in create_nodes and create_vis
  var svg = null;
  var bubbles = null;
  var nodes = [];

  // Charge function that is called for each node.
  // As part of the ManyBody force.
  // This is what creates the repulsion between nodes.
  //
  // Charge is proportional to the diameter of the
  // circle (which is stored in the radius attribute
  // of the circle's associated data.
  //
  // This is done to allow for accurate collision
  // detection with nodes of different sizes.
  //
  // Charge is negative because we want nodes to repel.
  // @v4 Before the charge was a stand-alone attribute
  //  of the force layout. Now we can use it as a separate force!
  function charge(d) {
    return -Math.pow(d.radius, 2.0) * forceStrength;
  }

  // Here we create a force layout and
  // @v4 We create a force simulation now and
  //  add forces to it.
  var simulation = d3.forceSimulation()
    .velocityDecay(0.2)
    .force('x', d3.forceX().strength(forceStrength).x(center.x))
    .force('y', d3.forceY().strength(forceStrength).y(center.y))
    .force('charge', d3.forceManyBody().strength(charge))
    .on('tick', ticked);

  // @v4 Force starts up automatically,
  //  which we don't want as there aren't any nodes yet.
  simulation.stop();

  /*
   * This data manipulation function takes the raw data from
   * the CSV file and converts it into an array of node objects.
   * Each node will store data and visualization values to visualize
   * a bubble.
   *
   * rawData is expected to be an array of data objects, read in from
   * one of d3's loading functions like d3.csv.
   *
   * This function returns the new node array, with a node in that
   * array for each element in the rawData input.
   */
  function createNodes(rawData) {
    // Use the max total_amount in the data as the max in the scale's domain
    // note we have to ensure the total_amount is a number.

    var maxAmount = d3.max(rawData, function (d) { return +d.LI_AMT; });

    // Sizes bubbles based on area.
    // @v4: new flattened scale names.
    var radiusScale = d3.scalePow()
      .exponent(0.5)
      .range([2, 45])
      .domain([0, maxAmount]);

    // Use map() to convert raw data into node data.
    // Checkout http://learnjsdata.com/ for more on
    // working with data.
    var myNodes = rawData.map(function (d) {
      var date = parseDate(d.ACCT_PER_DATE);
      start_year = date.getFullYear();
      var amount = +d.LI_AMT > 0 ? +d.LI_AMT : -d.LI_AMT;
      return {
        id: d.id,
        afe: d.AFE,
        radius: radiusScale(amount),
        value: amount,
        name: d.AREA,
        org: d.FIELD,
        group: d.ACCOUNT_DESCRIPTION,
        year: start_year,
        month: d3.timeFormat("%b")(date),
        x: Math.random() * 900,
        y: Math.random() * 800,
        revenue: +d.LI_AMT < 0,
        acct_per_date: parseDate(d.ACCT_PER_DATE)
      };
    });

    // sort them to prevent occlusion of smaller nodes.
    myNodes.sort(function (a, b) { return b.value - a.value; });

    return myNodes;
  }

  /*
   * Main entry point to the bubble chart. This function is returned
   * by the parent closure. It prepares the rawData for visualization
   * and adds an svg element to the provided selector and starts the
   * visualization creation process.
   *
   * selector is expected to be a DOM element or CSS selector that
   * points to the parent element of the bubble chart. Inside this
   * element, the code will add the SVG continer for the visualization.
   *
   * rawData is expected to be an array of data objects as provided by
   * a d3 loading function like d3.csv.
   */
  var chart = function chart(selector, rawData) {
    // Nice looking colors - no reason to buck the trend
    // @v4 scales now have a flattened naming scheme
    fillColor = d3.scaleOrdinal()
      .domain([...new Set(rawData.map(d => d.ACCOUNT_DESCRIPTION))])
      .range(['#d62728', '#ff7f0e', '#2ca02c', '#9467bd', '#1f77b4', '#e377c2']);

    // convert raw data into nodes data
    nodes = createNodes(rawData);

    // Create a SVG element inside the provided selector
    // with desired size.
    svg = d3.select(selector)
      .append('svg')
      .attr('width', width)
      .attr('height', height);

    // Bind nodes data to what will become DOM elements to represent them.
    bubbles = svg.selectAll('.bubble')
      .data(nodes, function (d) { return d.id; });

    // Create new circle elements each with class `bubble`.
    // There will be one circle.bubble for each object in the nodes array.
    // Initially, their radius (r attribute) will be 0.
    // @v4 Selections are immutable, so lets capture the
    //  enter selection to apply our transtition to below.
    var bubblesE = bubbles.enter().append('circle')
      .classed('bubble', true)
      .attr('r', 0)
      .attr('fill', function (d) { return !d.revenue ? fillColor(d.group) : "WHITE"; })
      .attr('stroke', function (d) { return d3.rgb(fillColor(d.group)).darker(); })
      .attr('stroke-width', 2)
      .on('mouseover', showDetail)
      .on('mouseout', hideDetail);

    // @v4 Merge the original empty selection and the enter selection
    bubbles = bubbles.merge(bubblesE);

    // Fancy transition to make bubbles appear, ending with the
    // correct radius
    bubbles.transition()
      .duration(2000)
      .attr('r', function (d) { return d.radius; });

    // Set the simulation's nodes to our newly created nodes array.
    // @v4 Once we set the nodes, the simulation will start running automatically!
    simulation.nodes(nodes);

    // Set initial layout to single group.
    groupBubbles();
  };

  /*
   * Callback function that is called after every tick of the
   * force simulation.
   * Here we do the acutal repositioning of the SVG circles
   * based on the current x and y values of their bound node data.
   * These x and y values are modified by the force simulation.
   */
  function ticked() {
    bubbles
      .attr('cx', function (d) { return d.x; })
      .attr('cy', function (d) { return d.y; });
  }

  /*
   * Provides a x value for each node to be used with the split by year
   * x force.
   */

  function nodeMonthPos(d) {
    return monthCenters[d.month].x;
  }

  function nodeAreaPos(d) {
    return areaCenters[d.name] ? areaCenters[d.name].x : 0;
  }

  function nodeAccountPos(d) {
    return accountCenters[d.group].x;
  }
  
  function groupBubbles() {

    // @v4 Reset the 'x' force to draw the bubbles to the center.
    simulation.force('x', d3.forceX().strength(forceStrength).x(center.x));

    // @v4 We can reset the alpha value and restart the simulation
    simulation.alpha(1).restart();
  }

  function splitBubblesArea() {
    var areaList = [...new Set(nodes.map(d => d.name))]

    areasTitleX = areaList.reduce(function (acc, cur, i) {
      acc[cur] = (i + 1) * width / (areaList.length + 1);
      return acc;
    }, {});

    showAreaTitles();

    areaCenters = areaList.reduce(function (acc, cur, i) {
      acc[cur] = { x: (i + 1) * width / (areaList.length + 1), y: height / 2 };
      return acc;
    }, {});
    // @v4 Reset the 'x' force to draw the bubbles to their area centers
    simulation.force('x', d3.forceX().strength(forceStrength).x(nodeAreaPos));

    // @v4 We can reset the alpha value and restart the simulation
    simulation.alpha(1).restart();
  }

  function splitBubblesMonth() {
    var monthList = [...new Set(nodes.map(d => d.month))]

    //sort monthList
    monthList.sort(function (a, b) {
      return d3.timeParse("%b")(a) - d3.timeParse("%b")(b);
    });

    monthTitleX = monthList.reduce(function (acc, cur, i) {
      acc[cur] = (i + 1) * width / (monthList.length + 1);
      return acc;
    }, {});

    showMonthTitles();

    monthCenters = monthList.reduce(function (acc, cur, i) {
      acc[cur] = { x: (i + 1) * width / (monthList.length + 1), y: height / 2 };
      return acc;
    }, {});

    // @v4 Reset the 'x' force to draw the bubbles to their area centers
    simulation.force('x', d3.forceX().strength(forceStrength).x(nodeMonthPos));

    // @v4 We can reset the alpha value and restart the simulation
    simulation.alpha(1).restart();
  }

  function splitBubblesAccount() {
    var accountList = [...new Set(nodes.map(d => d.group))]

    //sort monthList
    accountList.sort(function (a, b) {
      return a - b;
    });

    accountsTitleX = accountList.reduce(function (acc, cur, i) {
      acc[cur] = (i + 1) * width / (accountList.length + 1);
      return acc;
    }, {});

    showAccountTitles();

    accountCenters = accountList.reduce(function (acc, cur, i) {
      acc[cur] = { x: (i + 1) * width / (accountList.length + 1), y: height / 2 };
      return acc;
    }, {});

    // @v4 Reset the 'x' force to draw the bubbles to their area centers
    simulation.force('x', d3.forceX().strength(forceStrength).x(nodeAccountPos));

    // @v4 We can reset the alpha value and restart the simulation
    simulation.alpha(1).restart();
  }
  /*
   * Hides  title displays.
   */
  function hideTitles() {
    svg.selectAll('.month').remove();
    svg.selectAll('.area').remove();
    svg.selectAll('.account').remove();

  }


  /*
   * Shows Month title displays.
   */
  function showMonthTitles() {

    var monthsData = d3.keys(monthTitleX);
    var months = svg.selectAll('.month')
      .data(monthsData);

    months.enter().append('text')
      .attr('class', 'month')
      .attr('x', function (d) { return monthTitleX[d]; })
      .attr('y', 40)
      .attr('text-anchor', 'middle')
      .each(function(d) {

      var total = d3.sum(nodes.filter(function (d1) { return d1.month == d; }), function (d) { return d.value; });
        
        var text = d3.select(this);
        text.append('tspan')
          .attr('x', areasTitleX[d])
          .attr('dy', '-0.3em') // Adjust vertical position of the first line
          .text(d);

        text.append('tspan')
          .attr('x', areasTitleX[d])
          .attr('dy', '1.2em') // Adjust vertical position of the second line
          .text("$" + addCommas(total));
      });
  }

  /*
   * Shows Area title displays.
   */
  function showAreaTitles() {
    var areaData = d3.keys(areasTitleX);
    var areas = svg.selectAll('.area')
      .data(areaData);

    areas.enter().append('text')
      .attr('class', 'area')
      .attr('x', function (d) {
        return areasTitleX[d]; 
      })
      .attr('y', 40)
      .attr('text-anchor', 'middle')
      .each(function(d) {
        var total = d3.sum(nodes.filter(function (d1) { return d1.name == d; }), function (d) { return d.value; });
        
        var text = d3.select(this);
        text.append('tspan')
          .attr('x', areasTitleX[d])
          .attr('dy', '-0.3em') // Adjust vertical position of the first line
          .text(d);

        text.append('tspan')
          .attr('x', areasTitleX[d])
          .attr('dy', '1.2em') // Adjust vertical position of the second line
          .text("$" + addCommas(total));
      });
}
 function showAccountTitles() {
    var accountData = d3.keys(accountsTitleX);
    var accounts = svg.selectAll('.account')
      .data(accountData);

    accounts.enter().append('text')
      .attr('class', 'account')
      .attr('x', function (d) {
        return accountsTitleX[d]; 
      })
      .attr('y', 40)
      .attr('text-anchor', 'middle')
      .each(function(d) {
        var total = d3.sum(nodes.filter(function (d1) { return d1.group == d; }), function (d) { return d.value; });
        
        var text = d3.select(this);
        text.append('tspan')
          .attr('x', accountsTitleX[d])
          .attr('dy', '-0.3em') // Adjust vertical position of the first line
          .text(d);

        text.append('tspan')
          .attr('x', accountsTitleX[d])
          .attr('dy', '1.2em') // Adjust vertical position of the second line
          .text("$" + addCommas(total));
      });
    }
  /*
   * Function called on mouseover to display the
   * details of a bubble in the tooltip.
   */
  function showDetail(d) {
    // change outline to indicate hover state.
    d3.select(this).attr('stroke', 'black');

    var content = '<span class="name"></span><span class="value">' +
      d.name + "," + d.org +
      '</span><br/>' +
      '<span class="name">Desc: </span><span class="value">' +
      d.group +
      '</span><br/>' +
      '<span class="name">Amount: </span><span class="value">$' +
      addCommas(d.value) +
      '</span><br/>' +
      '<span class="name">Period: </span><span class="value">' +
      formatTime(d.acct_per_date) +
      '</span>';

    tooltip.showTooltip(content, d3.event);
  }

  /*
   * Hides tooltip
   */
  function hideDetail(d) {
    // reset outline
    d3.select(this)
      .attr('stroke', d3.rgb(fillColor(d.ACCOUNT_DESCRIPTION)).darker());

    tooltip.hideTooltip();
  }

  /*
   * Externally accessible function (this is attached to the
   * returned chart function). Allows the visualization to toggle
   * between modes.
   *
   * displayName is expected to be a string and either 'month', 'area', or 'all'.
   */
  chart.toggleDisplay = function (displayName) {
    hideTitles();

    if (displayName === 'area') {
      splitBubblesArea();
    } else if (displayName === 'month') {
      splitBubblesMonth();
    } else if (displayName === 'account') {
      splitBubblesAccount();
    }
     else if (displayName === 'all') {
      groupBubbles();
    }
  };


  // return the chart function from closure.
  return chart;
}

/*
 * Below is the initialization code as well as some helper functions
 * to create a new bubble chart instance, load the data, and display it.
 */

var myBubbleChart = bubbleChart();

/*
 * Function called once data is loaded from CSV.
 * Calls bubble chart function to display inside #vis div.
 */
function display(error, data) {
  if (error) {
    console.log(error);
  }

  myBubbleChart('#vis', data);
}

/*
 * Sets up the layout buttons to allow for toggling between view modes.
 */
function setupButtons() {
  d3.select('#toolbar')
    .selectAll('.button')
    .on('click', function () {
      // Remove active class from all buttons
      d3.selectAll('.button').classed('active', false);
      // Find the button just clicked
      var button = d3.select(this);

      // Set it as the active button
      button.classed('active', true);

      // Get the id of the button
      var buttonId = button.attr('id');

      // Toggle the bubble chart based on
      // the currently clicked button.
      myBubbleChart.toggleDisplay(buttonId);
    });
}

/*
 * Helper function to convert a number into a string
 * and add commas to it to improve presentation.
 */
function addCommas(nStr) {
  nStr += '';
  var x = nStr.split('.');
  var x1 = x[0];
  var x2 = x.length > 1 ? '.' + x[1] : '';
  var rgx = /(\d+)(\d{3})/;
  while (rgx.test(x1)) {
    x1 = x1.replace(rgx, '$1' + ',' + '$2');
  }
  x2 = x2.length > 3 ? x2.substring(0, 3) : x2;
  return x1 + x2;
}

// Load the data.
d3.csv('data/lastyeardem.csv', function (error1, data1) {
  if (error1) {
    console.log(error1);
  }

  d3.csv('data/railrows.csv', function (error, data) {
    if (error) {
      console.log(error);
    }
    var allData = data.concat(data1);
    allData = allData.filter(d => d.ACCT_PER_DATE > "2023-06");
    //  allData = allData.filter(d=> !d.AREA.includes("DS MARKETING"));
    allData = allData.filter(d => d.VOUCHER_TYPE_CODE == "ACCR");
    allData = allData.filter(d => +d.LI_AMT > 0);
    myBubbleChart('#vis', allData);
    legend();
    createTable(allData);
  });
});

// setup the buttons.
setupButtons();

function legend() {
  var svg = d3.select("svg");
  var width = +svg.attr("width");
  // Legend settings
  var legendSize = 12; // Size of the legend item
  var legendSpacing = 5; // Spacing between legend items

  // Creating legend
  var legend = svg.selectAll('.legend') // Selecting all elements with class 'legend'
    .data(fillColor.domain()) // Binding data (ACCOUNT_DESCRIPTION values)
    .enter()
    .append('g') // Appending a group for each legend item
    .attr('class', 'legend')
    .attr('transform', function (d, i) {
      var height = legendSize + legendSpacing;
      var offset = height * fillColor.domain().length / 2;
      var horz = width - 200; // Horizontal position
      var vert = (i + 2) * height + offset; // Vertical position
      return 'translate(' + horz + ',' + vert + ')'; // Setting the position for each legend item
    });


    // Creating colored circles for the legend
  legend.append('circle')
    .attr('r', legendSize / 2) // Setting the radius for the circle
    .style('fill', fillColor)
    .style('stroke', fillColor);


  // Adding text labels to the legend
  legend.append('text')
    .attr('x', legendSize + legendSpacing)
    .attr('y', legendSize - legendSpacing)
    .text(function (d) { return d; }); // Setting the text as the ACCOUNT_DESCRIPTION
}

function createTable(data) {
  // Select the HTML element where the table will be appended
  var tableDiv = d3.select('#expenseTable'); // Replace '#tableDiv' with the ID of your div

  // Create a table and append it to the div
  var table = tableDiv.append('table').attr('class', 'my-table'); // Add class for styling

  // Create the header row
  var headers = Object.keys(data[0]);
  table.append('thead').append('tr')
    .selectAll('th')
    .data(headers).enter()
    .append('th')
    .text(function (d) { return d; });

  // Create the table body
  var tbody = table.append('tbody');

  // Add rows to the table body
  data.forEach(function (d) {
    var row = tbody.append('tr');
    headers.forEach(function (header) {
      row.append('td').text(d[header]);
    });
  });
}

