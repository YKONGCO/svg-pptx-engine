import { CHART_NAME, SHAPE_NAME } from './core-enums';
import { FormulaProps, IChartMulti, IChartOpts, ImageProps, ISlideObject, MediaProps, PresSlide, ShapeProps, TableProps, TableRow, TextProps, TextPropsOptions } from './core-interfaces';
export declare class Group {
    _slideObjects: ISlideObject[];
    _slide: PresSlide;
    addSlide: Function;
    getSlide: Function;
    constructor(params: {
        slide: PresSlide;
        addSlide: Function;
        getSlide: Function;
    });
    /**
     * Add chart to Group
     * @param {CHART_NAME|IChartMulti[]} type - chart type
     * @param {object[]} data - data object
     * @param {IChartOpts} options - chart options
     * @return {Group} this Group
     */
    addChart(type: CHART_NAME | IChartMulti[], data: any[], options?: IChartOpts): Group;
    /**
     * Add image to Group
     * @param {ImageProps} options - image options
     * @return {Group} this Group
     */
    addImage(options: ImageProps): Group;
    /**
     * Add media (audio/video) to Group
     * @param {MediaProps} options - media options
     * @return {Group} this Group
     */
    addMedia(options: MediaProps): Group;
    /**
     * Add shape to Group
     * @param {SHAPE_NAME} shapeName - shape name
     * @param {ShapeProps} options - shape options
     * @return {Group} this Group
     */
    addShape(shapeName: SHAPE_NAME, options?: ShapeProps): Group;
    /**
     * Add table to Group
     * @param {TableRow[]} tableRows - table rows
     * @param {TableProps} options - table options
     * @return {Group} this Group
     */
    addTable(tableRows: TableRow[], options?: TableProps): Group;
    /**
     * Add text to Group
     * @param {string|TextProps[]} text - text string or complex object
     * @param {TextPropsOptions} options - text options
     * @return {Group} this Group
     */
    addText(text: string | TextProps[], options?: TextPropsOptions): Group;
    addFormula(options: FormulaProps): Group;
}
