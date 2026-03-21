import { CHART_NAME, SHAPE_NAME, SLIDE_OBJECT_TYPES } from './core-enums'
import { FormulaProps, IChartMulti, IChartOpts, IChartOptsLib, ImageProps, ISlideObject, MediaProps, PresSlide, ShapeProps, TableProps, TableRow, TextProps, TextPropsOptions } from './core-interfaces'
import * as genObj from './gen-objects'

export class Group {
	public _slideObjects: ISlideObject[]
	public _slide: PresSlide
	public addSlide: Function
	public getSlide: Function

	constructor(params: {
		slide: PresSlide
		addSlide: Function
		getSlide: Function
	}) {
		this._slideObjects = []
		this._slide = params.slide
		this.addSlide = params.addSlide
		this.getSlide = params.getSlide
	}

	/**
	 * Add chart to Group
	 * @param {CHART_NAME|IChartMulti[]} type - chart type
	 * @param {object[]} data - data object
	 * @param {IChartOpts} options - chart options
	 * @return {Group} this Group
	 */
	addChart(type: CHART_NAME | IChartMulti[], data: any[], options?: IChartOpts): Group {
		const optionsWithType: IChartOptsLib = options || {}
		optionsWithType._type = type
		genObj.addChartDefinition(this, this._slide, type, data, options)
		return this
	}

	/**
	 * Add image to Group
	 * @param {ImageProps} options - image options
	 * @return {Group} this Group
	 */
	addImage(options: ImageProps): Group {
		genObj.addImageDefinition(this, this._slide, options)
		return this
	}

	/**
	 * Add media (audio/video) to Group
	 * @param {MediaProps} options - media options
	 * @return {Group} this Group
	 */
	addMedia(options: MediaProps): Group {
		genObj.addMediaDefinition(this, this._slide, options)
		return this
	}

	/**
	 * Add shape to Group
	 * @param {SHAPE_NAME} shapeName - shape name
	 * @param {ShapeProps} options - shape options
	 * @return {Group} this Group
	 */
	addShape(shapeName: SHAPE_NAME, options?: ShapeProps): Group {
		genObj.addShapeDefinition(this, this._slide, shapeName, options)
		return this
	}

	/**
	 * Add table to Group
	 * @param {TableRow[]} tableRows - table rows
	 * @param {TableProps} options - table options
	 * @return {Group} this Group
	 */
	addTable(tableRows: TableRow[], options?: TableProps): Group {
		genObj.addTableDefinition(this, this._slide, tableRows, options, this._slide._slideLayout, this._slide._presLayout, this.addSlide as (options?: any) => PresSlide, this.getSlide as (slideNumber: number) => PresSlide)
		return this
	}

	/**
	 * Add text to Group
	 * @param {string|TextProps[]} text - text string or complex object
	 * @param {TextPropsOptions} options - text options
	 * @return {Group} this Group
	 */
	addText(text: string | TextProps[], options?: TextPropsOptions): Group {
		const textParam = typeof text === 'string' || typeof text === 'number' ? [{ text, options }] : text
		genObj.addTextDefinition(this, this._slide, textParam, options, false)
		return this
	}

	addFormula(options: FormulaProps): Group {
		genObj.addFormulaDefinition(this._slide, options)
		const formulaObject = this._slide._slideObjects.pop()
		if (formulaObject) {
			this._slideObjects.push(formulaObject)
		}
		return this
	}
}
